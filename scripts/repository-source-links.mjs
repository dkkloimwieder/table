import { existsSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

// These links refer to the current source branch, so CI can test them locally.
const sourcePrefix = 'https://github.com/dkkloimwieder/table/blob/main/'

export function resolveRepositorySourceLink(link, root = process.cwd()) {
  if (!link.startsWith(sourcePrefix)) return undefined

  let sourcePath
  try {
    sourcePath = decodeURIComponent(
      link.slice(sourcePrefix.length).split(/[?#]/)[0],
    )
  } catch {
    return { resolvedPath: link, reason: 'Invalid source path encoding' }
  }

  const resolvedPath = resolve(root, sourcePath)
  const relativePath = relative(root, resolvedPath)
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    isAbsolute(relativePath)
  ) {
    return { resolvedPath, reason: 'Path outside repository' }
  }

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    return { resolvedPath, reason: 'Source file not found' }
  }

  return { resolvedPath }
}
