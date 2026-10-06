import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveRepositorySourceLink } from '../repository-source-links.mjs'

const prefix = 'https://github.com/dkkloimwieder/table/blob/main/'
const root = fileURLToPath(new URL('../../', import.meta.url))

test('source links resolve files, fragments, and encoded names', () => {
  const directory = mkdtempSync(join(tmpdir(), 'table-source-links-'))
  try {
    mkdirSync(join(directory, 'packages'))
    writeFileSync(join(directory, 'packages', 'guide name.md'), '# Guide\n')
    assert.deepEqual(
      resolveRepositorySourceLink(
        `${prefix}packages/guide%20name.md#guide`,
        directory,
      ),
      { resolvedPath: join(directory, 'packages', 'guide name.md') },
    )
    assert.equal(
      resolveRepositorySourceLink(`${prefix}packages/missing.md`, directory)
        .reason,
      'Source file not found',
    )
    assert.equal(
      resolveRepositorySourceLink(`${prefix}packages`, directory).reason,
      'Source file not found',
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('source links reject paths outside the repository and invalid encoding', () => {
  for (const path of [
    '../outside.md',
    '%2e%2e/outside.md',
    '%2Ftmp/outside.md',
    '',
  ]) {
    assert.equal(
      resolveRepositorySourceLink(`${prefix}${path}`, root).reason,
      'Path outside repository',
    )
  }
  assert.equal(
    resolveRepositorySourceLink(`${prefix}%zz`, root).reason,
    'Invalid source path encoding',
  )
})

test('external pages and historical source links keep their existing policy', () => {
  for (const link of [
    'https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/MIGRATION.md',
    'https://github.com/dkkloimwieder/table/blob/old-commit/packages/example.ts',
    './native.md',
  ]) {
    assert.equal(resolveRepositorySourceLink(link, root), undefined)
  }
})

test('native guide source links point to existing repository files', () => {
  const guide = readFileSync(
    join(root, 'docs/framework/solid/guide/native.md'),
    'utf8',
  )
  const links = [
    ...guide.matchAll(
      /\]\((https:\/\/github\.com\/dkkloimwieder\/table\/blob\/main\/[^)]+)\)/g,
    ),
  ]
  assert.ok(links.length > 0, 'The native guide must include source links')
  for (const [, link] of links) {
    assert.equal(
      resolveRepositorySourceLink(link, root).reason,
      undefined,
      link,
    )
  }
  assert.doesNotMatch(guide, /\]\(\.\.\/\.\.\/\.\.\/\.\.\//)
})
