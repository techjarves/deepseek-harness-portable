import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scripts = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(scripts, 'manifest.json')
const packagePath = join(scripts, 'locks', 'package.json')
const lockPath = join(scripts, 'locks', 'package-lock.json')

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')) }
function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function fail(message) { throw new Error(message) }
function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) fail(`${command} ${args.join(' ')} failed with status ${result.status}`)
  return result.stdout?.trim() ?? ''
}
function npmView(spec) {
  return JSON.parse(run('npm', ['view', spec, 'version', 'dist.integrity', 'gitHead', '--json'], { capture: true }))
}
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version)
  if (!match) fail(`unsupported upstream version format: ${version}`)
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? [] }
}
function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index]
  }
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    if (a.pre[index] === undefined) return -1
    if (b.pre[index] === undefined) return 1
    if (a.pre[index] === b.pre[index]) continue
    const aNumber = /^\d+$/.test(a.pre[index])
    const bNumber = /^\d+$/.test(b.pre[index])
    if (aNumber && bNumber) return Number(a.pre[index]) - Number(b.pre[index])
    if (aNumber !== bNumber) return aNumber ? -1 : 1
    return a.pre[index].localeCompare(b.pre[index])
  }
  return 0
}
function packageNameFromLockPath(path) {
  const marker = 'node_modules/'
  const tail = path.slice(path.lastIndexOf(marker) + marker.length)
  const parts = tail.split('/')
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}
function allowedName(key) { return key.slice(0, key.lastIndexOf('@')) }
function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) fail(`invalid portable version: ${version}`)
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

const manifest = readJson(manifestPath)
const packageJson = readJson(packagePath)
const packageName = manifest.deepseekHarness.package
const channel = manifest.deepseekHarness.updateChannel ?? 'latest'
const metadata = npmView(`${packageName}@${process.env.DSH_CANDIDATE_VERSION ?? channel}`)
const candidate = metadata.version
const current = manifest.deepseekHarness.version

if (compareVersions(candidate, current) <= 0) {
  console.log(`No forward update: ${current} is current for the ${channel} channel.`)
  output('changed', 'false')
  output('portable_version', manifest.portableVersion)
  output('tag', `v${manifest.portableVersion}`)
  process.exit(0)
}

console.log(`Preparing ${packageName} ${current} -> ${candidate}`)
packageJson.dependencies[packageName] = candidate
writeJson(packagePath, packageJson)
run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dirname(packagePath) })

const lock = readJson(lockPath)
const approvedNames = new Set(Object.keys(manifest.allowScripts).map(allowedName))
const installScripts = []
for (const [path, value] of Object.entries(lock.packages ?? {})) {
  if (!value.hasInstallScript) continue
  const name = packageNameFromLockPath(path)
  if (!approvedNames.has(name)) fail(`new install-script dependency requires review: ${name}@${value.version}`)
  installScripts.push([name, value.version])
}
const allowScripts = Object.fromEntries(installScripts.sort(([a], [b]) => a.localeCompare(b)).map(([name, version]) => [`${name}@${version}`, true]))
packageJson.allowScripts = allowScripts
writeJson(packagePath, packageJson)
run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dirname(packagePath) })
run('npm', ['audit', '--package-lock-only', '--omit=dev', '--audit-level=moderate'], { cwd: dirname(packagePath) })

const finalLock = readJson(lockPath)
const dshEntry = finalLock.packages?.[`node_modules/${packageName}`]
if (!dshEntry?.integrity || dshEntry.version !== candidate) fail('generated lock does not contain the requested DeepSeek Harness package')
if (metadata['dist.integrity'] && metadata['dist.integrity'] !== dshEntry.integrity) fail('npm metadata integrity does not match the generated lock')

manifest.portableVersion = bumpPatch(manifest.portableVersion)
manifest.deepseekHarness.version = candidate
manifest.deepseekHarness.repositoryCommit = metadata.gitHead ?? null
manifest.deepseekHarness.integrity = dshEntry.integrity
manifest.allowScripts = allowScripts
manifest.dependencyLock.sha256 = sha256(readFileSync(lockPath))
writeJson(manifestPath, manifest)

output('changed', 'true')
output('portable_version', manifest.portableVersion)
output('tag', `v${manifest.portableVersion}`)
console.log(`Prepared portable release v${manifest.portableVersion}.`)
