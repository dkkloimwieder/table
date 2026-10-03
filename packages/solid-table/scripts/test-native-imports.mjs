import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const packageRoot = new URL('../', import.meta.url)
const manifest = JSON.parse(
  await readFile(new URL('package.json', packageRoot)),
)
for (const condition of ['solid', 'node', 'import', 'types']) {
  const entry = manifest.exports['./native'][condition]
  const visited = new Set()
  async function inspect(url) {
    if (visited.has(url.href)) return
    visited.add(url.href)
    const source = await readFile(url, 'utf8')
    for (const [, dependency] of source.matchAll(
      /\b(?:from\s*|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g,
    )) {
      if (dependency.startsWith('.')) {
        let target = new URL(dependency, url)
        if (condition === 'types' && target.pathname.endsWith('.js'))
          target = new URL(target.href.replace(/\.js$/, '.d.ts'))
        await inspect(target)
      } else {
        assert.equal(dependency, 'solid-js', `${condition}: ${url.pathname}`)
      }
    }
  }
  await inspect(new URL(entry, packageRoot))
  console.log(
    `Native ${condition} entry: ${visited.size} files, Solid-only imports.`,
  )
}
