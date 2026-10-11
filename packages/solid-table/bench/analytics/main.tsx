import { render } from '@solidjs/web'
import {
  OBSERVE,
  action,
  createMemo,
  createSignal,
  flush,
  onCleanup,
} from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { Table } from './Table'
import { inventory, sales, sortResult } from './demo-data'
import { createQueryPageCache } from './page-cache'
import type { QueryCacheConfiguration } from './page-cache'
import type {
  QueryExportRequest,
  QueryResult,
  QuerySorting,
  QueryState,
} from './types'
import './style.css'

let publish: ((value: QueryState) => void) | undefined
let dispose: (() => void) | undefined
let refreshServer: (() => Promise<void>) | undefined
let cacheStats:
  | (() => ReturnType<ReturnType<typeof createQueryPageCache>['stats']>)
  | undefined
let configureExport: ((configuration: ExportConfiguration) => void) | undefined
type ExportConfiguration = {
  mode?: 'csv' | 'capture' | 'none'
  disabled?: boolean
  server?: boolean
  cache?: QueryCacheConfiguration
}
const exportRequests: Array<QueryExportRequest> = []
let capture:
  ReturnType<NonNullable<typeof OBSERVE>['diagnostics']['capture']> | undefined
const events: Array<unknown> = []
let queryAbort: AbortController | undefined
let exportAbort: AbortController | undefined
let exportRequest = 0
let request = 0
let timer: ReturnType<typeof setTimeout> | undefined
function load(query: string) {
  const current = ++request
  clearTimeout(timer)
  publish?.({ status: 'loading' })
  timer = setTimeout(() => {
    if (request === current)
      publish?.({
        status: 'ready',
        result: query === 'inventory' ? inventory : sales,
      })
  }, 200)
}
// eslint-disable-next-line require-yield -- Use the qualified runtime disposal path.
const disposeRoot = action(function* () {
  dispose?.()
})
function stop() {
  ++request
  ++exportRequest
  queryAbort?.abort()
  exportAbort?.abort()
  clearTimeout(timer)
  disposeRoot()
  dispose = undefined
  publish = undefined
  configureExport = undefined
  refreshServer = undefined
  cacheStats = undefined
  flush()
}
function start(
  state: QueryState = { status: 'ready', result: sales },
  configuration: ExportConfiguration = {},
) {
  stop()
  exportRequests.length = 0
  events.push(...(capture?.stop() ?? []))
  capture = OBSERVE?.diagnostics.capture()
  dispose = render(() => {
    const cache = createQueryPageCache(configuration.cache)
    cacheStats = cache.stats
    onCleanup(cache.clear)
    const [query, setQuery] = createSignal<QueryState>(state)
    const [choice, setChoice] = createSignal('sales')
    const [exportConfiguration, setExportConfiguration] =
      createSignal(configuration)
    configureExport = (value) => {
      setExportConfiguration(value)
      flush()
    }
    const [sorting, setSorting] = createSignal<QuerySorting>([])
    const [exporting, setExporting] = createSignal(false)
    const [exportError, setExportError] = createSignal('')
    const [browsing, setBrowsing] = createSignal(false)
    const [offset, setOffset] = createSignal(0)
    const [pageBusy, setPageBusy] = createSignal(false)
    const [pageError, setPageError] = createSignal('')
    let failedOffset = 0
    const latest = createMemo<QueryResult | undefined>((previous) =>
      query().status === 'ready'
        ? (query() as { status: 'ready'; result: QueryResult }).result
        : previous,
    )
    let supplied = state.status === 'ready' ? state.result : undefined
    async function queryServer(
      key: string,
      order: QuerySorting = sorting(),
      nextOffset = 0,
      page = false,
      reuse = false,
      endOffset = nextOffset,
    ) {
      const current = ++request
      queryAbort?.abort()
      const controller = new AbortController()
      queryAbort = controller
      cache.scope(key, order)
      if (!page && !reuse) cache.clear()
      setPageError('')
      const total = page ? latest()?.totalRows : undefined
      const length = page
        ? Math.min(
            Math.max(
              cache.pageSize * 2,
              Math.ceil((endOffset - nextOffset) / cache.pageSize) *
                cache.pageSize,
            ),
            Math.max(0, (total ?? Infinity) - nextOffset),
          )
        : 1000
      const retained = cache.read(nextOffset, length)
      if (retained) {
        setPageBusy(false)
        setOffset(nextOffset)
        supplied = retained
        setQuery({ status: 'ready', result: retained })
        flush()
        return
      }
      if (page) setPageBusy(true)
      else {
        setPageBusy(false)
        setOffset(0)
        setQuery({ status: 'loading' })
      }
      flush()
      try {
        const fetchPage = async (start: number, limit: number) => {
          const remembered = cache.read(start, limit)
          if (remembered) return remembered
          const response = await fetch('/api/analytics/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              queryKey: key,
              sorting: order,
              limit,
              offset: start,
            }),
            signal: controller.signal,
          })
          if (!response.ok) throw new Error('The query request failed')
          const result = (await response.json()) as QueryResult
          if (current === request && !controller.signal.aborted)
            cache.put(start, result)
          return result
        }
        const pages: Array<QueryResult> = []
        if (page) {
          let index = 0
          const count = Math.ceil(length / cache.pageSize)
          const worker = async () => {
            while (index < count) {
              const currentIndex = index++
              pages[currentIndex] = await fetchPage(
                nextOffset + currentIndex * cache.pageSize,
                cache.pageSize,
              )
            }
          }
          await Promise.all(Array.from({ length: Math.min(2, count) }, worker))
        } else pages.push(await fetchPage(0, 1000))
        if (current !== request) return
        const first = pages[0]!
        const result =
          pages.length > 1
            ? { ...first, rows: pages.flatMap((value) => value.rows) }
            : first
        setOffset(nextOffset)
        supplied = result
        setQuery({ status: 'ready', result })
      } catch (error) {
        if (current !== request || controller.signal.aborted) return
        controller.abort()
        if (page) {
          failedOffset = nextOffset
          setPageError(String(error))
        } else setQuery({ status: 'error', message: String(error) })
      }
      if (current === request) setPageBusy(false)
      flush()
    }
    refreshServer = () => queryServer('sales', [])
    const runQuery = (key: string) => {
      if (exportConfiguration().server) {
        setBrowsing(false)
        setSorting([])
        void queryServer(key, [])
      } else load(key)
    }
    const exportResult = (description: QueryExportRequest) => {
      if (exportConfiguration().mode === 'capture') {
        exportRequests.push(description)
        return
      }
      const current = ++exportRequest
      exportAbort?.abort()
      const controller = new AbortController()
      exportAbort = controller
      setExporting(true)
      setExportError('')
      flush()
      void (async () => {
        try {
          const response = await fetch('/api/analytics/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(description),
            signal: controller.signal,
          })
          if (!response.ok) throw new Error('The export request failed')
          const download: { url: string } = await response.json()
          if (current !== exportRequest) return
          const link = document.createElement('a')
          link.href = download.url
          link.download = 'analytics.csv'
          link.click()
        } catch (error) {
          if (current !== exportRequest || controller.signal.aborted) return
          setExportError(String(error))
        } finally {
          if (current === exportRequest) {
            setExporting(false)
            flush()
          }
        }
      })()
    }
    publish = (value) => {
      cache.clear()
      if (value.status === 'ready') {
        if (
          !supplied ||
          JSON.stringify([
            supplied.key,
            supplied.columns.map((column) => column.id),
          ]) !==
            JSON.stringify([
              value.result.key,
              value.result.columns.map((column) => column.id),
            ])
        )
          setSorting([])
        supplied = value.result
      }
      setQuery(value)
      flush()
    }
    return (
      <main>
        <h1>Query analytics</h1>
        <p>
          The application supplies the result. Display changes affect this table
          only.
        </p>
        <label>
          Example query
          <select
            value={choice()}
            ref={nativeEvents<HTMLSelectElement>({
              change: (event) => {
                setChoice(event.currentTarget.value)
                runQuery(event.currentTarget.value)
              },
            })}
          >
            <option value="sales">Sales</option>
            <option value="inventory">Inventory</option>
            <option value="large">Large result</option>
          </select>
        </label>
        <button
          type="button"
          ref={nativeEvents({ click: () => runQuery(choice()) })}
        >
          Run query
        </button>
        <Table
          query={query()}
          retry={() =>
            exportConfiguration().server
              ? void queryServer(choice())
              : load(choice())
          }
          onExport={
            exportConfiguration().mode === 'none' ? undefined : exportResult
          }
          exportLabel={
            exportConfiguration().mode === 'capture' ? 'Export' : 'Export CSV'
          }
          exportDisabled={exportConfiguration().disabled || exporting()}
          sorting={sorting()}
          onLoadAll={
            exportConfiguration().server
              ? () => {
                  setBrowsing(true)
                  flush()
                }
              : undefined
          }
          onShowPreview={(description) => {
            setBrowsing(false)
            void queryServer(
              description.queryKey,
              description.sorting,
              0,
              false,
              true,
            )
          }}
          window={
            browsing() && latest()?.totalRows !== undefined
              ? {
                  offset: offset(),
                  totalRows: latest()!.totalRows!,
                  loading: pageBusy(),
                  onRangeChange: (nextOffset, end) => {
                    const result = latest()
                    if (
                      result &&
                      nextOffset < (result.totalRows ?? 0) &&
                      !pageBusy() &&
                      !pageError()
                    )
                      void queryServer(
                        result.key,
                        sorting(),
                        Math.floor(nextOffset / cache.pageSize) *
                          cache.pageSize,
                        true,
                        false,
                        end,
                      )
                  },
                }
              : undefined
          }
          onSortingChange={(description) => {
            setSorting(description.sorting)
            if (exportConfiguration().server)
              void queryServer(description.queryKey, description.sorting)
            else if (supplied) {
              setQuery({
                status: 'ready',
                result: sortResult(supplied, description.sorting),
              })
              flush()
            }
          }}
        />
        {exportError() && <p role="alert">{exportError()}</p>}
        {pageBusy() && <p role="status">Loading rows…</p>}
        {pageError() && (
          <p role="alert">
            {pageError()}{' '}
            <button
              type="button"
              ref={nativeEvents({
                click: () => {
                  const result = latest()
                  if (result)
                    void queryServer(result.key, sorting(), failedOffset, true)
                },
              })}
            >
              Retry rows
            </button>
          </p>
        )}
      </main>
    )
  }, document.getElementById('root')!)
  flush()
  if (state.status === 'ready') return register(state.result)
  return undefined
}
async function register(result: QueryResult) {
  const response = await fetch('/api/analytics/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  })
  if (!response.ok) throw new Error('The demo result registration failed')
}
async function startServer(cache: QueryCacheConfiguration = {}) {
  start({ status: 'loading' }, { server: true, cache })
  await refreshServer?.()
}

const api = {
  start,
  stop,
  startServer,
  cacheStats: () => cacheStats?.(),
  publish: async (state: QueryState) => {
    if (state.status === 'ready') await register(state.result)
    publish?.(state)
  },
  sales,
  configureExport: (configuration: ExportConfiguration) =>
    configureExport?.(configuration),
  exportRequests: () => exportRequests,
  diagnostics: () => {
    events.push(...(capture?.stop() ?? []))
    capture = OBSERVE?.diagnostics.capture()
    return events.splice(0)
  },
}
declare global {
  interface Window {
    analyticsFixture: typeof api
  }
}
window.analyticsFixture = api
void startServer()
