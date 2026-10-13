import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = resolve(packageRoot, 'bench/table')
const document = readFileSync(resolve(directory, 'UI-BOUNDARIES.md'), 'utf8')
const configPath = resolve(directory, 'tsconfig.json')
const config = ts.readConfigFile(configPath, ts.sys.readFile)
if (config.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(config.error.messageText, '\n'),
  )
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory)
const files = new Map(
  [...document.matchAll(/^```(ts|tsx)\n([^]*?)^```/gm)].map((match, index) => [
    resolve(directory, `ui-contract-example-${index}.${match[1]}`),
    match[2],
  ]),
)
if (!files.size) throw new Error('No UI contract examples found')
const host = ts.createCompilerHost(parsed.options)
const readFile = host.readFile.bind(host)
const fileExists = host.fileExists.bind(host)
host.readFile = (path) => files.get(path) ?? readFile(path)
host.fileExists = (path) => files.has(path) || fileExists(path)
const program = ts.createProgram([...files.keys()], parsed.options, host)
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (path) => path,
      getCurrentDirectory: () => packageRoot,
      getNewLine: () => '\n',
    }),
  )
  process.exitCode = 1
} else {
  console.log(`Typechecked ${files.size} UI contract examples`)
}
