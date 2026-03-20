import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
      ...options
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited via signal ${signal}`))
        return
      }

      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`))
        return
      }

      resolve()
    })
  })
}

const tailwindCli = path.join(rootDir, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs')
const buildAssetsScript = path.join(rootDir, 'scripts', 'build-ui-assets.mjs')

await run(process.execPath, [tailwindCli, '-i', './src/ui/globals.css', '-o', './src/ui/generated.css', '--minify'])
await run(process.execPath, [buildAssetsScript])
