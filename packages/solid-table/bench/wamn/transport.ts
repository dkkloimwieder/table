import { createTransport } from './.input/runtime'
import type { Widget } from './createWamnTable'

export const widgetId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const makerId = (index: number) =>
  `10000000-0000-4000-8000-${String(index % 2).padStart(12, '0')}`
export function makeWidget(index: number): Widget {
  return {
    id: widgetId(index),
    code: index % 2 ? 'priority' : 'standard',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    editVersion: '9007199254740993',
    makerId: makerId(index),
    note: `Widget ${index}`,
  }
}
const wire = (row: Widget) => ({
  id: row.id,
  code: row.code,
  created_at: row.createdAt,
  edit_version: row.editVersion,
  maker_id: row.makerId,
  note: row.note,
})
type Fault =
  | 'hold'
  | 'refuse'
  | 'duplicate'
  | 'overlap'
  | 'oversize'
  | 'conflict'
  | 'wrongId'
  | 'uncertain'

/** Scripted HTTP boundary. The real WAMN transport still encodes and decodes. */
export function createFixtureServer(size = 8) {
  const overrides = new Map<string, Widget>()
  const sent: Array<{
    path: string
    method: string
    item: Record<string, unknown>
  }> = []
  const faults = new Map<string, Fault>()
  const held: Array<() => void> = []
  let disposed = false
  const record = (index: number) =>
    overrides.get(widgetId(index)) ?? makeWidget(index)
  const transport = createTransport({
    baseUrl: 'https://fixture.invalid',
    fetch: async (url, init) => {
      if (disposed) throw new Error('Fixture server disposed')
      const parsed = new URL(String(url))
      const item: Record<string, unknown> =
        init?.method === 'GET'
          ? Object.fromEntries(
              [...parsed.searchParams].map(([key, value]) => [
                key,
                JSON.parse(value),
              ]),
            )
          : JSON.parse(String(init?.body))[0]
      const path = parsed.pathname
      sent.push({ path, method: init!.method!, item })
      const fault = faults.get(path)
      faults.delete(path)
      const envelope: Record<string, unknown> =
        init?.method === 'GET' ? {} : { request_id: item.request_id }
      if (fault === 'refuse')
        envelope.error = {
          code: 'permission_denied',
          detail: { operation: path },
        }
      else if (fault === 'uncertain')
        envelope.error = { code: 'internal_error' }
      else if (path === '/widget/query') {
        const filter = item.filter as { code?: Array<string> } | undefined
        let indices = Array.from({ length: size }, (_, index) => index).filter(
          (index) => !filter?.code || filter.code.includes(record(index).code),
        )
        if (
          (item.sort as { direction?: string } | undefined)?.direction ===
          'descending'
        )
          indices = indices.reverse()
        const offset = Number(item.cursor ?? 0)
        const limit = Number(item.limit ?? 100)
        const selected = indices
          .slice(offset, offset + limit)
          .map((index) => wire(record(index)))
        if (fault === 'duplicate' && selected.length > 1)
          selected[1] = selected[0]!
        if (fault === 'overlap' && selected.length)
          selected[0] = wire(record(0))
        if (fault === 'oversize') selected.push(wire(makeWidget(size + 1)))
        envelope.value = {
          item: selected,
          next_cursor:
            offset + limit < indices.length ? String(offset + limit) : null,
        }
      } else if (path === '/widget/update') {
        const index = Number(String(item.id).slice(-12))
        const current = record(index)
        if (
          fault === 'conflict' ||
          item.expected_edit_version !== current.editVersion
        ) {
          envelope.error = {
            code: 'concurrency_conflict',
            detail: {
              expected_row_version: item.expected_edit_version,
              observed_row_version: (
                BigInt(current.editVersion) + 1n
              ).toString(),
            },
          }
        } else {
          const change = item.change as { note?: string; code?: Widget['code'] }
          const next = {
            ...current,
            ...change,
            editVersion: (BigInt(current.editVersion) + 1n).toString(),
          }
          overrides.set(next.id, next)
          envelope.value = wire(
            fault === 'wrongId' ? { ...next, id: widgetId(size + 1) } : next,
          )
        }
      } else if (path === '/widget-maker/get') {
        envelope.value = {
          id: item.id,
          created_at: makeWidget(0).createdAt,
          name: String(item.id).endsWith('0') ? 'Northwind' : 'Southwind',
        }
      } else if (path === '/widget/get') {
        envelope.value = wire(record(Number(String(item.id).slice(-12))))
      } else throw new Error(`Unimplemented fixture route: ${path}`)
      const body = JSON.stringify([envelope])
      if (fault === 'hold')
        await new Promise<void>((resolve) => held.push(resolve))
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  })
  return {
    transport,
    sent,
    fault: (path: string, fault: Fault) => faults.set(path, fault),
    release: () => held.shift()?.(),
    patch: (index: number, change: Partial<Widget>) =>
      overrides.set(widgetId(index), { ...record(index), ...change }),
    dispose: () => {
      disposed = true
      held.splice(0).forEach((release) => release())
      overrides.clear()
      sent.length = 0
    },
  }
}
