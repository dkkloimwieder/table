import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const sourceDir = new URL('../src/', import.meta.url)
const outputDir = new URL('../dist/solid/', import.meta.url)
const files = (await readdir(sourceDir)).filter((file) => /\.tsx?$/.test(file))
const outputs = new Map(
  files.map((file) => [
    file.replace(/\.tsx?$/, ''),
    file.replace(/\.tsx?$/, file.endsWith('.tsx') ? '.jsx' : '.js'),
  ]),
)
await mkdir(outputDir, { recursive: true })
for (const file of files) {
  const source = await readFile(new URL(file, sourceDir), 'utf8')
  const result = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
    },
  })
  const code = result.outputText.replace(
    /(from\s+|import\s*)["'](\.\/[^"']+)["']/g,
    (match, prefix, specifier) => {
      const output = outputs.get(specifier.slice(2))
      return output ? `${prefix}'./${output}'` : match
    },
  )
  await writeFile(
    new URL(outputs.get(path.basename(file).replace(/\.tsx?$/, '')), outputDir),
    code,
  )
}
