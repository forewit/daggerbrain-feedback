import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registerScript = path.join(rootDir, 'scripts', 'register-commands.mjs')

const child = spawn(process.execPath, ['--env-file=.env', registerScript], {
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
    console.error(`register-commands exited via signal ${signal}`)
    process.exit(1)
    return
  }

  process.exit(code ?? 0)
})
