import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

function fail(message) { throw new Error(message) }
function log(message) { process.stdout.write(`[portable] ${message}\n`) }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function sha256(data) { return createHash('sha256').update(data).digest('hex') }
// Git may check text files out with CRLF on Windows. The release lock is hashed
// in its canonical LF form so the same signed manifest works on every host.
function sha256CanonicalText(data) {
  return sha256(Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'))
}
function writeJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  const staged = `${path}.new`
  writeFileSync(staged, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(staged, path)
}
function versionsEqual(left, right) {
  return left.portableVersion === right.portableVersion
    && left.deepseekHarness?.version === right.deepseekHarness?.version
    && left.dependencyLock?.sha256 === right.dependencyLock?.sha256
}
function comparePortableVersions(left, right) {
  const a = String(left).split('.').map(Number)
  const b = String(right).split('.').map(Number)
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(value => !Number.isInteger(value))) return 0
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index]
  return 0
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`${command} exited with status ${result.status}`)
  return result.status
}

const argv = process.argv.slice(2)
const valueAfter = name => {
  const index = argv.indexOf(name)
  if (index < 0 || !argv[index + 1]) fail(`missing ${name}`)
  return argv[index + 1]
}
const root = resolve(valueAfter('--root'))
const target = valueAfter('--target')
const start = argv.indexOf('--target') + 2
const args = argv.slice(start)
const scripts = join(root, 'scripts')
let manifest = readJson(join(scripts, 'manifest.json'))
const runtime = join(root, 'runtimes', target)
const node = process.execPath
const npmCli = target === 'windows-x64'
  ? join(runtime, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : join(runtime, 'node', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
const app = join(runtime, 'dsh')
const dshBin = join(app, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const state = join(root, 'state', target)
const env = {
  ...process.env,
  DSH_HOME: join(root, 'data', 'dsh-home'),
  DSH_AGENTS_HOME: join(root, 'data', 'agents-home'),
  HOME: join(root, 'data', 'portable-home'),
  USERPROFILE: join(root, 'data', 'portable-home'),
  XDG_CACHE_HOME: join(root, 'packages', 'cache', target, 'xdg'),
  npm_config_cache: join(root, 'packages', 'cache', target, 'npm'),
  npm_config_prefix: join(runtime, 'npm-global'),
  TEMP: join(root, 'temp', target),
  TMP: join(root, 'temp', target),
  TMPDIR: join(root, 'temp', target),
  PATH: target === 'windows-x64'
    ? `${join(runtime, 'bin')};${join(runtime, 'node')};${process.env.PATH ?? ''}`
    : `${join(runtime, 'bin')}:${join(runtime, 'node', 'bin')}:${process.env.PATH ?? ''}`,
}

function ensureLayout() {
  for (const path of [
    env.DSH_HOME, env.DSH_AGENTS_HOME, env.HOME, env.XDG_CACHE_HOME,
    env.npm_config_cache, env.npm_config_prefix, env.TEMP, runtime, state,
    join(root, 'models'), join(root, 'logs'), join(root, 'packages', 'downloads'),
  ]) mkdirSync(path, { recursive: true })
}

function expectedState() {
  return {
    schema: 1,
    target,
    portableVersion: manifest.portableVersion,
    dshVersion: manifest.deepseekHarness.version,
    nodeVersion: manifest.node.version,
  }
}

function installed() {
  try {
    const current = readJson(join(state, 'install.json'))
    const expected = expectedState()
    return existsSync(dshBin) && Object.keys(expected).every(key => current[key] === expected[key])
  } catch { return false }
}

function acquireLock() {
  const lock = join(root, 'state', '.setup-lock')
  try { mkdirSync(lock, { recursive: false }) } catch { fail(`another setup is active (${lock})`) }
  return () => rmSync(lock, { recursive: true, force: true })
}

function setup() {
  ensureLayout()
  const unlock = acquireLock()
  try {
    const version = manifest.deepseekHarness.version
    const stage = join(runtime, `dsh.stage.${process.pid}`)
    rmSync(stage, { recursive: true, force: true })
    mkdirSync(stage, { recursive: true })
    writeJson(join(stage, 'package.json'), {
      private: true,
      description: 'Platform-local DeepSeek Harness portable runtime',
      allowScripts: manifest.allowScripts,
      dependencies: {
        '@deepseek-ai/dsh': version,
        pnpm: manifest.pnpm,
      },
      overrides: manifest.overrides,
    })
    const lockPath = join(scripts, manifest.dependencyLock.path)
    const lockBytes = readFileSync(lockPath)
    if (sha256CanonicalText(lockBytes) !== manifest.dependencyLock.sha256) fail('tested npm dependency lock checksum mismatch')
    copyFileSync(lockPath, join(stage, 'package-lock.json'))
    log(`installing DeepSeek Harness ${version} for ${target}`)
    run(node, [npmCli, 'ci', '--prefix', stage, '--omit=dev', '--no-audit', '--no-fund', '--no-bin-links'], { env })
    const packageMeta = readJson(join(stage, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))
    if (packageMeta.version !== version) fail(`registry returned dsh ${packageMeta.version}, expected ${version}`)
    const installedLock = readJson(join(stage, 'package-lock.json'))
    const dshLock = installedLock.packages?.['node_modules/@deepseek-ai/dsh']
    if (dshLock?.integrity !== manifest.deepseekHarness.integrity) fail('installed dsh package integrity does not match the tested manifest')
    const binDir = join(runtime, 'bin')
    mkdirSync(binDir, { recursive: true })
    if (target === 'windows-x64') {
      writeFileSync(join(binDir, 'pnpm.cmd'), '@echo off\r\n"%~dp0..\\node\\node.exe" "%~dp0..\\dsh\\node_modules\\pnpm\\bin\\pnpm.cjs" %*\r\n')
      writeFileSync(join(binDir, 'pnpx.cmd'), '@echo off\r\n"%~dp0..\\node\\node.exe" "%~dp0..\\dsh\\node_modules\\pnpm\\bin\\pnpm.cjs" dlx %*\r\n')
    } else {
      const prologue = '#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)\n'
      writeFileSync(join(binDir, 'pnpm'), `${prologue}exec "$HERE/../node/bin/node" "$HERE/../dsh/node_modules/pnpm/bin/pnpm.cjs" "$@"\n`, { mode: 0o755 })
      writeFileSync(join(binDir, 'pnpx'), `${prologue}exec "$HERE/../node/bin/node" "$HERE/../dsh/node_modules/pnpm/bin/pnpm.cjs" dlx "$@"\n`, { mode: 0o755 })
    }
    const previous = join(root, 'temp', `previous-dsh-${target}`)
    rmSync(previous, { recursive: true, force: true })
    if (existsSync(app)) renameSync(app, previous)
    renameSync(stage, app)
    rmSync(previous, { recursive: true, force: true })
    writeJson(join(state, 'install.json'), { ...expectedState(), completedAt: new Date().toISOString() })
    writeFileSync(join(env.DSH_HOME, 'PLAINTEXT-CREDENTIALS-WARNING.txt'),
      'Credentials stored by DeepSeek Harness travel with this folder in plaintext. exFAT cannot enforce reliable per-user permissions.\n')
    log(`setup complete for ${target}`)
  } finally { unlock() }
}

function doctor() {
  ensureLayout()
  const checks = [
    ['supported target', ['windows-x64', 'linux-x64', 'macos-arm64'].includes(target), target],
    ['Node.js', process.versions.node === manifest.node.version, process.version],
    ['DeepSeek Harness', installed(), existsSync(dshBin) ? dshBin : 'not installed'],
    ['shared DSH_HOME', existsSync(env.DSH_HOME), env.DSH_HOME],
    ['models preservation folder', existsSync(join(root, 'models')), join(root, 'models')],
    ['exFAT-safe runtime', !containsSymlink(runtime), 'no symlinks'],
  ]
  for (const [name, ok, detail] of checks) console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}: ${detail}`)
  return checks.every(([, ok]) => ok) ? 0 : 1
}

function containsSymlink(base) {
  if (!existsSync(base)) return false
  const pending = [base]
  while (pending.length) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) return true
      if (entry.isDirectory()) pending.push(path)
    }
  }
  return false
}

async function launch(dshArgs) {
  ensureLayout()
  await maybeAutoUpdate()
  if (!installed()) setup()
  const result = spawnSync(node, [dshBin, ...dshArgs], { stdio: 'inherit', cwd: process.cwd(), env })
  if (result.error) throw result.error
  return result.status ?? 1
}

async function portableUpdate(rest) {
  let url = process.env.DSH_PORTABLE_MANIFEST_URL || manifest.release?.manifestUrl || ''
  const index = rest.indexOf('--manifest')
  if (index >= 0) url = rest[index + 1] ?? fail('portable-update --manifest requires a URL')
  if (!url) {
    log('already on the locally pinned tested manifest')
    log('pass --manifest URL after publishing the portable GitHub release repository')
    return 0
  }
  const response = await fetch(url)
  if (!response.ok) fail(`manifest download failed: HTTP ${response.status}`)
  const candidate = await response.json()
  if (candidate.schema !== 1 || !candidate.deepseekHarness?.version || !candidate.node?.[target]?.sha256 || !candidate.dependencyLock?.sha256) fail('remote manifest is invalid')
  if (comparePortableVersions(candidate.portableVersion, manifest.portableVersion) < 0) {
    log('local portable bootstrap is newer than the published release')
    return 0
  }
  if (versionsEqual(candidate, manifest)) {
    log('already on the latest tested portable release')
    return 0
  }
  if (candidate.node.version !== manifest.node.version) fail('this update changes Node.js; download the newer portable bootstrap release')
  const lockUrl = new URL(candidate.dependencyLock.url, url)
  const lockResponse = await fetch(lockUrl)
  if (!lockResponse.ok) fail(`dependency lock download failed: HTTP ${lockResponse.status}`)
  const lockBytes = Buffer.from(await lockResponse.arrayBuffer())
  if (sha256(lockBytes) !== candidate.dependencyLock.sha256) fail('remote dependency lock checksum mismatch')
  const manifestPath = join(scripts, 'manifest.json')
  const lockPath = join(scripts, candidate.dependencyLock.path)
  const oldManifest = readFileSync(manifestPath)
  const oldLock = readFileSync(lockPath)
  try {
    writeFileSync(`${lockPath}.new`, lockBytes)
    renameSync(`${lockPath}.new`, lockPath)
    writeJson(manifestPath, candidate)
    manifest = candidate
    setup()
  } catch (error) {
    writeFileSync(lockPath, oldLock)
    writeFileSync(manifestPath, oldManifest)
    manifest = JSON.parse(oldManifest.toString('utf8'))
    throw error
  }
  return 0
}

async function maybeAutoUpdate() {
  if (process.env.DSH_PORTABLE_NO_AUTO_UPDATE === '1') return
  const intervalHours = Number(manifest.release?.autoUpdateHours ?? 6)
  if (!Number.isFinite(intervalHours) || intervalHours < 0) return
  const checkPath = join(state, 'update-check.json')
  try {
    const last = readJson(checkPath)
    if (Date.now() - Date.parse(last.checkedAt) < intervalHours * 60 * 60 * 1000) return
  } catch {}
  try {
    log('checking for a tested portable update')
    await portableUpdate([])
    writeJson(checkPath, { checkedAt: new Date().toISOString(), portableVersion: manifest.portableVersion })
  } catch (error) {
    log(`automatic update skipped: ${error.message}`)
    log('continuing with the installed version')
  }
}

async function main() {
  const command = args[0] ?? 'web'
  const rest = args.slice(1)
  if (command === 'setup') { setup(); return 0 }
  if (command === 'doctor') return doctor()
  if (command === 'portable-update') return portableUpdate(rest)
  if (command === '--') return await launch(rest)
  return await launch(args.length ? args : ['web'])
}

try { process.exitCode = await main() }
catch (error) { console.error(`Portable DeepSeek Harness error: ${error.message}`); process.exitCode = 1 }
