import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wranglerCli = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const args = process.argv.slice(2)

const child = spawn(process.execPath, [wranglerCli, ...args], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    NODE_TLS_REJECT_UNAUTHORIZED: '0'
  }
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`wrangler exited via signal ${signal}`)
    process.exit(1)
    return
  }

  process.exit(code ?? 0)
})
