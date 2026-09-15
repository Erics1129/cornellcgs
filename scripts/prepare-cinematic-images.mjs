import { readFile, mkdir, copyFile } from 'node:fs/promises'
import { dirname } from 'node:path'
const sharpModule = process.env.CGS_SHARP_MODULE || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs'
const { default: sharp } = await import(sharpModule)
const manifest = JSON.parse(await readFile('docs/generated-cinematic-prompts.json', 'utf8'))
for (const asset of manifest.assets) {
  if (!asset.source) continue
  await mkdir(dirname(asset.master), { recursive: true })
  await mkdir(dirname(asset.asset), { recursive: true })
  await copyFile(asset.source, asset.master)
  const info = await sharp(asset.master).webp({ quality: 89, effort: 6 }).toFile(asset.asset)
  console.log(asset.id, info.width, info.height, info.size)
}
