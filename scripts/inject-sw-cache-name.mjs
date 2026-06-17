import { readFile, writeFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const version =
  typeof packageJson.version === 'string' && packageJson.version.trim()
    ? packageJson.version.trim()
    : '0.0.0'
const cacheName = `meliora-shell-v${version}`
const swPath = new URL('../dist/sw.js', import.meta.url)

let content
try {
  content = await readFile(swPath, 'utf8')
} catch {
  console.log('[inject-sw-cache-name] dist/sw.js not found, skipping')
  process.exit(0)
}

const updated = content.replaceAll('__SW_CACHE_NAME__', cacheName)
await writeFile(swPath, updated)
console.log(`[inject-sw-cache-name] injected CACHE_NAME=${cacheName} into dist/sw.js`)
