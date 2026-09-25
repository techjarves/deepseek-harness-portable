# DeepSeek Harness Portable

This package runs the official `@deepseek-ai/dsh` distribution without installing Node.js, pnpm, or DeepSeek Harness on the host computer.

## Start

- Windows 10/11 x64: run `windows.bat`.
- glibc Linux x64: run `sh linux.sh`.
- Apple Silicon macOS: run `sh mac.sh`.

With no arguments, the launcher starts the Web UI at the address printed by DeepSeek Harness (normally `http://127.0.0.1:3080`). Each operating system downloads only its own runtime on first use.

```text
<launcher>                  start the Web UI
<launcher> setup            install or repair this OS runtime
<launcher> doctor           verify the portable installation
<launcher> portable-update  apply a tested portable manifest
<launcher> -- <dsh args>    pass arguments to dsh
```

Examples:

```text
sh mac.sh -- --help
sh linux.sh -- --profile headless "your task"
windows.bat -- web --no-open
```

User settings, credentials, sessions, skills, and plugins live in `data/dsh-home` through the official `DSH_HOME` interface. Platform-specific Node modules and native addons live under `runtimes/<platform>`.

## Credentials and models

DeepSeek Harness reads `DEEPSEEK_API_KEY` and related settings through its normal setup/UI. Credentials in the portable data directory are plaintext and travel with the drive. The top-level `models/` directory is reserved for user models and is the only mutable payload preserved by reset.

## Reset

Use `scripts/reset.bat` on Windows or `sh scripts/reset.sh` on Linux/macOS. Reset preserves `models/` and the installer files, but deletes all installed runtimes and Harness user data.

## Filesystem notes

The bootstrap deliberately omits Node's npm/npx/corepack symlinks and invokes npm through Node directly. A Linux external drive mounted with `noexec` must be remounted with execution enabled. Linux initial extraction needs `tar` with xz support; Ubuntu 22.04 and 24.04 provide this through `xz-utils`.
