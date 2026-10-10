import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'

const files = []
for (const fixture of ['editing', 'popup', 'hydration', 'editing-overhead']) {
  const directory = `bench/${fixture}`
  files.push(
    ...(await readdir(directory))
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => `${directory}/${file}`),
  )
}
// Explicit paths keep ESLint from reading configuration for unrelated .mjs
// harnesses and downloaded sources while it walks a glob.
const result = spawnSync('pnpm', ['exec', 'eslint', ...files], {
  stdio: 'inherit',
})
if (result.error) console.error(result.error)
process.exitCode = result.status ?? 1
