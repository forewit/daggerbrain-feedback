import { readFile, writeFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/ui/generated.css', import.meta.url), 'utf8')
const faviconBuffer = await readFile(new URL('../favicon.webp', import.meta.url))
const faviconHref = `data:image/webp;base64,${faviconBuffer.toString('base64')}`

const output = `export const dashboardStyles = ${JSON.stringify(css)};\nexport const dashboardFaviconHref = ${JSON.stringify(faviconHref)};\n`

await writeFile(new URL('../src/ui/generated-assets.ts', import.meta.url), output)
