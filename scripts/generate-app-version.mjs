import { mkdir, readFile, writeFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const version =
  typeof packageJson.version === 'string' && packageJson.version.trim()
    ? packageJson.version.trim()
    : '0.0.0'
const target = new URL('../src/generated/app-version.ts', import.meta.url)

await mkdir(new URL('.', target), { recursive: true })
await writeFile(target, `export const APP_VERSION = '${version}'\n`)
