# DeepSeek Harness Portable

[![Cross-platform tests](https://github.com/techjarves/deepseek-harness-portable/actions/workflows/test.yml/badge.svg)](https://github.com/techjarves/deepseek-harness-portable/actions/workflows/test.yml)
[![Automatic updates](https://github.com/techjarves/deepseek-harness-portable/actions/workflows/auto-update.yml/badge.svg)](https://github.com/techjarves/deepseek-harness-portable/actions/workflows/auto-update.yml)
[![Latest release](https://img.shields.io/github/v/release/techjarves/deepseek-harness-portable?display_name=tag)](https://github.com/techjarves/deepseek-harness-portable/releases/latest)

Run the official DeepSeek Harness from one portable folder on Windows, Linux, and macOS. Host-level Node.js or npm installation is not required.

The same folder can live on an internal disk, USB drive, or external SSD. Each operating system downloads only its own runtime, while sessions and settings remain shared.

## Supported platforms

| Platform | Architecture | Baseline | Launcher |
| --- | --- | --- | --- |
| Windows | x64 | Windows 10 or 11 | `windows.bat` |
| Linux | x64 | glibc, Ubuntu 22.04 compatible | `linux.sh` |
| macOS | Apple Silicon | arm64 | `mac.sh` |

Windows ARM64, Linux ARM64, macOS Intel, and musl-based Linux distributions are not supported in version 1.

## Quick start

Download [the latest portable ZIP](https://github.com/techjarves/deepseek-harness-portable/releases/latest/download/deepseek-harness-portable.zip), extract it, and run the launcher for the current operating system.

### Windows

```bat
windows.bat setup
windows.bat
```

### Linux

```sh
sh linux.sh setup
sh linux.sh
```

### macOS

```sh
sh mac.sh setup
sh mac.sh
```

Running a launcher without arguments starts the DeepSeek Harness web interface. The terminal prints its local address, normally `http://127.0.0.1:3080`.

## Launcher commands

All launchers expose the same interface:

| Command | Purpose |
| --- | --- |
| `<launcher>` | Start the web interface |
| `<launcher> setup` | Install or repair the current platform |
| `<launcher> doctor` | Verify the runtime and portable layout |
| `<launcher> portable-update` | Force an immediate update check |
| `<launcher> -- <arguments>` | Pass arguments directly to `dsh` |

Examples:

```sh
sh mac.sh -- --help
sh linux.sh -- --profile headless "your task"
```

```bat
windows.bat -- web --no-open
```

## Portability model

- Node.js, pnpm, native modules, caches, and temporary files are stored per platform under `runtimes/`, `packages/`, and `temp/`.
- DeepSeek Harness uses the official `DSH_HOME` interface at `data/dsh-home`.
- Sessions, settings, credentials, skills, and plugins travel with the portable folder.
- Platform runtimes are installed lazily; launching on Linux never downloads Windows or macOS assets.
- Runtime installation uses staging, checksum verification, and atomic promotion.
- Symlinks are not used, making the layout suitable for exFAT.
- Moving or renaming the folder does not modify system configuration.

## Fully automatic updates

Installed copies check for a tested release at most once every 24 hours. If an update is available, it is verified and installed before DeepSeek Harness starts. Network or installation failures leave the existing runtime active.

The repository also checks the DeepSeek Harness npm `next` channel once per day. A new upstream version is published only after the automation:

1. Generates an exact dependency lock.
2. Runs the vulnerability audit.
3. Performs clean installations on every supported platform.
4. Runs contract, doctor, and CLI smoke tests.
5. Publishes the release archive, SHA-256 checksums, and build provenance.

No routine developer release work is required. Failed candidates are not published, and the previous release remains available.

To disable launcher-side checks for a controlled environment, set `DSH_PORTABLE_NO_AUTO_UPDATE=1`.

## Reset

Reset removes installed runtimes, application state, sessions, settings, credentials, caches, downloads, and logs. The `models/` folder and the immutable bootstrap files are preserved.

```bat
scripts\reset.bat
```

```sh
sh scripts/reset.sh
```

Reset requires confirmation before deleting portable data.

## Security and credentials

Credentials saved by DeepSeek Harness are stored inside the portable folder and travel with it. They are plaintext at rest, and exFAT cannot provide reliable per-user permissions.

- Keep the drive physically secure.
- Do not commit `data/`, `state/`, runtimes, caches, or model files to Git.
- Use `SHA256SUMS` from the release page to verify downloaded assets.
- Release archives include GitHub build provenance.

Cloud model requests still require network access and valid provider credentials. The installed DeepSeek Harness core can start offline after initialization.

## Testing

Every source change is tested through GitHub Actions on:

- Windows Server 2022 x64
- Ubuntu 22.04 x64
- Ubuntu 24.04 x64
- Apple Silicon macOS

See [the test history](https://github.com/techjarves/deepseek-harness-portable/actions/workflows/test.yml) for current results.

## Project layout

The repository root intentionally contains only:

```text
windows.bat
linux.sh
mac.sh
```

Bootstrap logic, documentation, manifests, reset tools, tests, and automation are organized in functional subdirectories.

## Upstream project

This project packages the official [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh) distribution. DeepSeek Harness itself is maintained in the [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) repository.
