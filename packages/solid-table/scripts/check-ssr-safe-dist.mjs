// SSR-safety contract for the built @tanstack/solid-table dist.
//
// WHY (spike bead table-v3p.6, guard bead table-v3p.8): the adapter's dist is
// DOM-compiled — tsdown.config.ts runs a bare `solid()` from vite-plugin-solid,
// i.e. generate: 'dom' — yet it server-renders correctly today. That only works
// because the adapter's JSX contains no HTML elements, so the transform emits no
// DOM primitives: the whole dist imports just `createComponent` and `memo` from
// @solidjs/web, and both are real functions in that package's server build.
// Every other DOM primitive there is an alias of `notSup`:
//
//   // @solidjs/web/dist/server.js
//   function notSup() {
//     throw new Error("Client-only API called on the server side. ...")
//   }
//   export { ..., notSup as insert, notSup as spread, notSup as template, ... }
//
// So one HTML element added to FlexRender.tsx or createTableHook.tsx would break
// every SSR consumer at import time, and no other gate would notice: the unit
// suite runs in a DOM environment.
//
// The guard is an ALLOW-LIST so a newly emitted primitive fails closed. Three
// stages, all of which must pass:
//
//   1. self-test    — the scanner is run against fixtures covering every import
//                     form, so a broken matcher fails the build instead of
//                     silently passing everything.
//   2. dist scan    — every @solidjs/web reference in dist/**/*.js must be a
//                     plain named import of allow-listed names only.
//   3. server build — the installed @solidjs/web server build must still export
//                     the allow-listed names as real functions rather than
//                     notSup, so an upstream reclassification is caught too.
//                     It runs before the report is printed and supplies the
//                     per-name verdict shown next to each violation, so the
//                     output never guesses whether an offending name is
//                     genuinely client-only.
//
// Scope: only DIRECT references to @solidjs/web in our own output are checked.
// The dist's only other externals are solid-js and @tanstack/table-core, neither
// of which has client-only throwers; and a specifier assembled at runtime (e.g.
// import('@solidjs' + '/web')) is invisible to any static scan — rolldown emits
// neither.
//
// Usage: node ./scripts/check-ssr-safe-dist.mjs [distDir]
// Wired into this package's `test:build`, which nx runs after `build`.
//
// This guard becomes redundant if table-v3p.7 lands (a canonical `solid` export
// condition pointing at uncompiled JSX makes the consumer compile our source per
// environment), but it costs ~50ms and pins the contract until then.

import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { relative, resolve } from 'node:path'

/**
 * Names our dist may import from @solidjs/web. Both are re-exported straight
 * from solid-js by the server build, so neither is a notSup thrower — stage 3
 * re-verifies that on every run.
 *
 * Before adding a name: confirm it is exported by @solidjs/web/dist/server.js
 * WITHOUT the `notSup as` prefix, and record why the adapter needs it.
 */
const ALLOWED = new Set(['createComponent', 'memo'])

/** The module specifier is exact — subpaths such as @solidjs/web/jsx-runtime */
/** resolve to the CLIENT build even under node conditions. */
const MODULE = '@solidjs/web'

const SPECIFIER = /(['"])(@solidjs\/web(?:\/[^'"]*)?)\1/g

/**
 * Any name outside the allow list fails, but WHY it fails differs: most are
 * genuine client-only throwers (an HTML element crept into the adapter's JSX),
 * while a few are real server exports the adapter could legitimately want — a
 * component spread, for instance, makes the JSX transform emit `mergeProps`,
 * which is SSR-safe. The report is built from what the installed server build
 * actually says about each name so the stated cause is never a guess.
 */
function remediation({ sawClientOnly, sawRealName, classified }) {
  const lines = [
    "Any @solidjs/web import outside this guard's allow list fails by design:",
    'names aliased to notSup in that package\'s server build throw "Client-only',
    'API called on the server side", crashing every SSR consumer of',
    '@tanstack/solid-table at import time. See bead table-v3p.6 and',
    'docs/framework/solid/guide/solid-2.md.',
  ]
  if (!classified) {
    lines.push(
      '',
      'The server build could not be inspected this run, so the names above are',
      'unclassified. Two causes are possible: an HTML element added to the',
      "adapter's JSX (src/FlexRender.tsx, src/createTableHook.tsx), which is a real",
      'break; or a name that is safe on the server and simply not allow-listed yet.',
      'Check by hand whether @solidjs/web/dist/server.js exports it without the',
      '`notSup as` prefix.',
    )
    return lines
  }
  if (sawClientOnly) {
    lines.push(
      '',
      "Most likely cause: an HTML element was added to the adapter's JSX",
      '(src/FlexRender.tsx, src/createTableHook.tsx). The adapter must render only',
      'components and control flow, never DOM elements of its own.',
    )
  }
  if (sawRealName) {
    lines.push(
      '',
      'The names marked real in the server build are SSR-safe in principle; the',
      'guard still fails on them because the allow list is exhaustive. Add such a',
      'name to ALLOWED in this file, with a note on why the adapter needs it.',
    )
  }
  return lines
}

function lineOf(code, index) {
  let line = 1
  for (let cursor = 0; cursor < index; cursor++) {
    if (code[cursor] === '\n') line++
  }
  return line
}

/**
 * Every @solidjs/web reference in `code`, classified. Anything that is not a
 * plain named static import of allow-listed names is a violation — including
 * forms this scanner cannot vet statically (namespace, default, dynamic).
 *
 * @param {string} file label used in messages
 * @param {string} code module source
 * @returns {{ violations: Array<{file: string, line: number, message: string}>,
 *             imports: Array<{file: string, line: number, name: string}> }}
 */
export function scanSource(file, code) {
  const violations = []
  const imports = []

  for (const match of code.matchAll(SPECIFIER)) {
    const specifier = match[2]
    const line = lineOf(code, match.index)
    const at = { file, line }
    const before = code.slice(0, match.index).trimEnd()

    if (specifier !== MODULE) {
      violations.push({
        ...at,
        message: `imports the subpath "${specifier}" — subpaths of ${MODULE} have no "node" export condition and resolve to the client build even on the server`,
      })
      continue
    }

    if (/\bimport\s*\($/.test(before)) {
      violations.push({
        ...at,
        message: `dynamically imports "${MODULE}" — a dynamic import cannot be vetted statically`,
      })
      continue
    }
    if (/\brequire\s*\($/.test(before)) {
      violations.push({
        ...at,
        message: `requires "${MODULE}" — a require call cannot be vetted statically`,
      })
      continue
    }
    if (/\bimport$/.test(before)) {
      violations.push({
        ...at,
        message: `has a side-effect import of "${MODULE}" — the whole module is evaluated, including client-only setup`,
      })
      continue
    }
    if (!/\bfrom$/.test(before)) {
      violations.push({
        ...at,
        message: `references "${MODULE}" in a form this guard cannot classify — treat as unsafe until vetted by hand`,
      })
      continue
    }

    const head = before.slice(0, before.length - 'from'.length)
    const keyword = [...head.matchAll(/\b(import|export)\b/g)].pop()
    if (!keyword) {
      violations.push({
        ...at,
        message: `has a "from" clause for "${MODULE}" with no import/export keyword — unparseable, treated as unsafe`,
      })
      continue
    }

    const lineStart = head.lastIndexOf('\n', keyword.index) + 1
    if (head.slice(lineStart, keyword.index).includes('//')) {
      // A line comment sitting between the real clause and `from` would
      // otherwise re-anchor the parse onto the comment's own keyword, hiding
      // the actual names. Rolldown cannot emit that shape, but the guard must
      // not depend on that.
      violations.push({
        ...at,
        message: `has a "from" clause for "${MODULE}" whose nearest import/export keyword is inside a line comment — unparseable, treated as unsafe`,
      })
      continue
    }

    const clause = head.slice(keyword.index + keyword[0].length).trim()
    const open = clause.indexOf('{')
    const close = clause.lastIndexOf('}')
    if (open === -1 || close === -1) {
      violations.push({
        ...at,
        message: `imports "${MODULE}" as \`${keyword[1]} ${clause}\` — namespace, default and star forms pull in the entire module surface`,
      })
      continue
    }

    const outside = (clause.slice(0, open) + clause.slice(close + 1)).replace(
      /[\s,]/g,
      '',
    )
    if (outside !== '') {
      violations.push({
        ...at,
        message: `imports "${MODULE}" as \`${keyword[1]} ${clause}\` — only a plain named import is allowed`,
      })
      continue
    }

    const names = clause
      .slice(open + 1, close)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.split(/\s+as\s+/)[0].trim())

    if (names.length === 0) {
      violations.push({
        ...at,
        message: `has an empty named import of "${MODULE}" — the module is still evaluated`,
      })
      continue
    }

    for (const name of names) {
      if (ALLOWED.has(name)) {
        imports.push({ ...at, name })
      } else {
        // Deliberately says nothing about whether the name is client-only —
        // only the server build knows that, and the caller annotates each one
        // with the ground truth.
        violations.push({
          ...at,
          name,
          message: `imports \`${name}\` from "${MODULE}", which is not on the allow list`,
        })
      }
    }
  }

  return { violations, imports }
}

const FIXTURES = [
  ['allow-listed named import', 'import { memo } from "@solidjs/web"', false],
  [
    'allow-listed named import with alias',
    'import { createComponent as c, memo } from "@solidjs/web";',
    false,
  ],
  [
    'allow-listed named import across lines',
    'import {\n  createComponent,\n  memo,\n} from "@solidjs/web"\n',
    false,
  ],
  ['single-quoted specifier', "import { memo } from '@solidjs/web'", false],
  ['unrelated module', 'import { createSignal } from "solid-js"', false],
  ['client-only primitive', 'import { template } from "@solidjs/web"', true],
  [
    'name that is real on the server but not allow-listed',
    'import { isServer } from "@solidjs/web"',
    true,
  ],
  [
    'import keyword hidden in a line comment',
    'import { template }\n// import { memo }\nfrom "@solidjs/web"\n',
    true,
  ],
  [
    'client-only primitive alongside an allowed one',
    'import { memo, insert } from "@solidjs/web"',
    true,
  ],
  [
    'client-only primitive after an allowed import',
    'import { memo } from "@solidjs/web"\nimport { spread } from "@solidjs/web"\n',
    true,
  ],
  ['namespace import', 'import * as web from "@solidjs/web"', true],
  ['default import', 'import web from "@solidjs/web"', true],
  [
    'default plus named import',
    'import web, { memo } from "@solidjs/web"',
    true,
  ],
  ['side-effect import', 'import "@solidjs/web"', true],
  ['empty named import', 'import {} from "@solidjs/web"', true],
  ['star re-export', 'export * from "@solidjs/web"', true],
  [
    'named re-export of a client-only API',
    'export { insert } from "@solidjs/web"',
    true,
  ],
  ['dynamic import', 'const web = await import("@solidjs/web")', true],
  ['require call', 'const web = require("@solidjs/web")', true],
  ['subpath import', 'import { ssr } from "@solidjs/web/jsx-runtime"', true],
  ['bare specifier string', 'const id = "@solidjs/web"', true],
  [
    'side-effect import followed by a named import',
    'import "./polyfill.js"\nimport { insert } from "@solidjs/web"\n',
    true,
  ],
]

function selfTest() {
  const failures = []
  for (const [label, code, expected] of FIXTURES) {
    const { violations } = scanSource('<fixture>', code)
    if (violations.length > 0 !== expected) {
      failures.push(
        `  ${label}: expected ${expected ? 'a violation' : 'no violation'}, got ${violations.length}`,
      )
    }
  }
  return failures
}

async function collectDistFiles(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectDistFiles(path)))
    } else if (/\.[mc]?js$/.test(entry.name)) {
      // .d.ts files are deliberately skipped: `import { JSX } from
      // '@solidjs/web'` in a declaration file is erased at compile time.
      // .cjs is matched even though the build is esm-only today, so switching
      // formats cannot silently take output out of scope.
      files.push(path)
    }
  }
  return files.sort()
}

/**
 * Stage 3: the installed @solidjs/web server build must still back the
 * allow-listed names with real implementations. Runs before the dist report so
 * every offending name can be annotated with what the server build really says
 * about it. Never throws; failures come back as `errors`.
 */
async function inspectServerBuild() {
  const errors = []
  let web
  try {
    web = await import(MODULE)
  } catch (error) {
    return {
      errors: [
        `could not import "${MODULE}" to verify the server build: ${error.message}`,
      ],
    }
  }

  if (web.isServer !== true) {
    return {
      errors: [
        `imported "${MODULE}" but got isServer=${String(web.isServer)} — expected the server build.`,
        `Run this script under plain node conditions (no --conditions=browser).`,
      ],
    }
  }

  const notSup = web.template
  let sentinelThrew = false
  try {
    notSup()
  } catch (error) {
    sentinelThrew = /client-only api/i.test(error.message)
  }
  if (typeof notSup !== 'function' || !sentinelThrew) {
    return {
      errors: [
        `the "${MODULE}" server build no longer aliases \`template\` to a client-only thrower.`,
        `This guard's model of the server build is stale — re-verify the SSR contract (bead table-v3p.6) before trusting it again.`,
      ],
    }
  }

  const exported = new Set(Object.keys(web))
  const clientOnly = new Set(
    [...exported].filter((name) => web[name] === notSup),
  )

  for (const name of ALLOWED) {
    if (!exported.has(name)) {
      errors.push(
        `allow-listed name \`${name}\` is not exported by the ${MODULE} server build`,
      )
    } else if (clientOnly.has(name)) {
      errors.push(
        `allow-listed name \`${name}\` is now a client-only thrower in the ${MODULE} server build — it must be removed from ALLOWED and from the adapter`,
      )
    }
  }

  return { errors, exported, clientOnly }
}

function fail(heading, lines) {
  console.error(`\n✖ ${heading}\n`)
  for (const line of lines) console.error(`  ${line}`)
  process.exitCode = 1
}

const distDir = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : fileURLToPath(new URL('../dist/', import.meta.url))
const relativeLabel = relative(process.cwd(), distDir)
const label =
  relativeLabel && !relativeLabel.startsWith('..') ? relativeLabel : distDir

const selfTestFailures = selfTest()
if (selfTestFailures.length > 0) {
  fail(
    'check-ssr-safe-dist self-test failed — the scanner is broken, so its "pass" would be meaningless',
    selfTestFailures,
  )
  process.exit(1)
}

let distStat
try {
  distStat = await stat(distDir)
} catch {
  fail(`no dist to check at ${label}`, [
    'Run `pnpm build` (or `nx build @tanstack/solid-table`) first — this guard only',
    'has meaning against built output.',
  ])
  process.exit(1)
}
if (!distStat.isDirectory()) {
  fail(`${label} is not a directory`, [])
  process.exit(1)
}

const files = await collectDistFiles(distDir)
if (files.length === 0) {
  fail(`no .js files found in ${label}`, [
    'The build produced no JavaScript, so nothing could be verified.',
  ])
  process.exit(1)
}

const violations = []
const imports = []
for (const file of files) {
  const result = scanSource(
    relative(distDir, file),
    await readFile(file, 'utf8'),
  )
  violations.push(...result.violations)
  imports.push(...result.imports)
}

const server = await inspectServerBuild()
const classified = Boolean(server.clientOnly)

const verdictOf = (name) => {
  if (server.clientOnly.has(name)) {
    return ' (client-only in the server build — never allow-list it)'
  }
  if (!server.exported.has(name)) {
    return ' (not exported by the server build at all)'
  }
  return ' (real in the server build — allow-list it deliberately if needed)'
}

let failed = false

if (violations.length > 0) {
  const named = violations.filter((violation) => violation.name)
  fail(
    `${label} breaks the SSR contract (${violations.length} violation${violations.length === 1 ? '' : 's'})`,
    [
      ...violations.map(
        (violation) =>
          `${violation.file}:${violation.line} — ${violation.message}` +
          (violation.name && classified ? verdictOf(violation.name) : ''),
      ),
      '',
      ...remediation({
        classified,
        sawClientOnly:
          classified &&
          named.some((violation) => server.clientOnly.has(violation.name)),
        sawRealName:
          classified &&
          named.some(
            (violation) =>
              !server.clientOnly.has(violation.name) &&
              server.exported.has(violation.name),
          ),
      }),
    ],
  )
  failed = true
}

if (server.errors.length > 0) {
  fail(
    `the installed ${MODULE} server build no longer matches the contract`,
    server.errors,
  )
  failed = true
}

if (failed) process.exit(1)

const used = new Map()
for (const entry of imports) {
  if (!used.has(entry.name)) used.set(entry.name, [])
  used.get(entry.name).push(`${entry.file}:${entry.line}`)
}

console.log(`✔ ${label} is SSR-safe (${files.length} files scanned)`)
for (const [name, sites] of [...used].sort()) {
  console.log(`  ${MODULE}: ${name} — ${sites.join(', ')}`)
}
if (used.size === 0) {
  console.log(`  ${MODULE}: no imports at all`)
}
console.log(
  `  server build: ${server.clientOnly.size} of ${server.exported.size} exports are notSup throwers; every allow-listed name verified real`,
)
