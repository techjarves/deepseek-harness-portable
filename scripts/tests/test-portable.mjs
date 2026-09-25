import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(scripts, '..')
const rootFiles = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => entry.name).sort()
assert.deepEqual(rootFiles, ['linux.sh', 'mac.sh', 'windows.bat'])
const manifest = JSON.parse(readFileSync(join(scripts, 'manifest.json'), 'utf8'))
assert.equal(manifest.deepseekHarness.package, '@deepseek-ai/dsh')
assert.match(manifest.deepseekHarness.version, /^\d+\.\d+\.\d+(?:-(?:alpha|rc)\.\d+)?$/)
assert.match(manifest.deepseekHarness.updateChannel, /^(?:latest|next|alpha)$/)
assert.equal(manifest.release.autoUpdateHours, 6)
assert.deepEqual(Object.keys(manifest.node).filter(key => key.includes('-')).sort(), ['linux-x64', 'macos-arm64', 'windows-x64'])
for (const target of ['linux-x64', 'macos-arm64', 'windows-x64']) assert.match(manifest.node[target].sha256, /^[0-9a-f]{64}$/)
console.log('portable contract tests passed')
