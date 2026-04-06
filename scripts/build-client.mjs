import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const client = path.join(root, 'client')

function resolveTool(pkg, segments) {
  const rel = path.join(pkg, ...segments)
  const inClient = path.join(client, 'node_modules', rel)
  const inRoot = path.join(root, 'node_modules', rel)
  if (fs.existsSync(inClient)) return inClient
  if (fs.existsSync(inRoot)) return inRoot
  throw new Error(
    `Build: "${rel}" nicht gefunden (weder unter client/node_modules noch Root node_modules). ` +
      'Führe im Repo-Root "npm install" aus und committe package-lock.json.',
  )
}

function run(scriptPath, args) {
  const r = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: client,
    stdio: 'inherit',
    shell: false,
  })
  if (r.error) {
    console.error(r.error)
    process.exit(1)
  }
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const tscJs = resolveTool('typescript', ['lib', 'tsc.js'])
const viteJs = resolveTool('vite', ['bin', 'vite.js'])

run(tscJs, ['-b'])
run(viteJs, ['build'])
