import { randomUUID } from 'node:crypto'
import { sales, inventory, sortResult } from './demo-data.ts'
import { csvLine } from './csv.ts'

const large = {
  key: 'large',
  columns: [
    { id: 'index', label: 'Index' },
    { id: 'name', label: 'Name' },
  ],
  rows: Array.from({ length: 100005 }, (_, index) => ({
    id: `row-${index}`,
    values: { index, name: `Row ${index}` },
  })),
}
const results = new Map(
  [sales, inventory, large].map((result) => [result.key, result]),
)
const downloads = new Map()
const MAX_PREVIEW = 1000
async function body(request) {
  let value = ''
  for await (const chunk of request) {
    value += chunk
    if (value.length > 20_000_000) throw new Error('Request is too large')
  }
  return JSON.parse(value)
}
function description(value) {
  const result = results.get(value.queryKey)
  if (!result) throw new Error('Unknown query')
  const ids = new Set(result.columns.map((column) => column.id))
  const sorting = value.sorting ?? []
  if (
    !Array.isArray(sorting) ||
    sorting.some((sort) => !ids.has(sort.id) || typeof sort.desc !== 'boolean')
  )
    throw new Error('Invalid sorting')
  return sortResult(result, sorting)
}
export async function handleAnalyticsRequest(request, response) {
  const url = new URL(request.url, 'http://localhost')
  if (!url.pathname.startsWith('/api/analytics/')) return false
  try {
    if (
      url.pathname === '/api/analytics/register' &&
      request.method === 'POST'
    ) {
      const result = await body(request)
      results.set(result.key, result)
      response.writeHead(204).end()
    } else if (
      url.pathname === '/api/analytics/query' &&
      request.method === 'POST'
    ) {
      const value = await body(request)
      const result = description(value)
      const limit = value.limit ?? MAX_PREVIEW
      const offset = value.offset ?? 0
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > MAX_PREVIEW ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      )
        throw new Error('Invalid preview range')
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          ...result,
          totalRows: result.rows.length,
          rows: result.rows.slice(offset, offset + limit),
        }),
      )
    } else if (
      url.pathname === '/api/analytics/export' &&
      request.method === 'POST'
    ) {
      const value = await body(request)
      const result = description(value)
      const ids = new Set(result.columns.map((column) => column.id))
      if (
        !Array.isArray(value.columns) ||
        !value.columns.length ||
        value.columns.some(
          (column) => !ids.has(column.id) || typeof column.label !== 'string',
        )
      )
        throw new Error('Invalid export columns')
      const token = randomUUID()
      downloads.set(token, { result, columns: value.columns })
      const timer = setTimeout(() => downloads.delete(token), 30000)
      timer.unref()
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ url: `/api/analytics/download/${token}` }))
    } else if (
      url.pathname.startsWith('/api/analytics/download/') &&
      request.method === 'GET'
    ) {
      const token = url.pathname.split('/').at(-1)
      const download = downloads.get(token)
      downloads.delete(token)
      if (!download) throw new Error('Download expired')
      response.setHeader('Content-Type', 'text/csv;charset=utf-8')
      response.setHeader(
        'Content-Disposition',
        'attachment; filename="analytics.csv"',
      )
      response.write(
        '\uFEFF' + csvLine(download.columns.map((column) => column.label)),
      )
      for (const row of download.result.rows) {
        if (response.destroyed) break
        const values = download.columns.map((column) =>
          Object.hasOwn(row.values, column.id)
            ? row.values[column.id]
            : undefined,
        )
        if (!response.write(csvLine(values))) {
          await new Promise((resolve) => {
            const done = () => {
              response.off('drain', done)
              response.off('close', done)
              resolve()
            }
            response.once('drain', done)
            response.once('close', done)
          })
        }
      }
      response.end()
    } else response.writeHead(404).end()
  } catch (error) {
    if (!response.headersSent) {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: error.message }))
    } else response.destroy(error)
  }
  return true
}
