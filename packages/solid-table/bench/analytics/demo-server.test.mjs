import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { handleAnalyticsRequest } from './demo-server.mjs'

test('Demo query ranges and export requests use server records', async (t) => {
  const server = createServer((request, response) => {
    void handleAnalyticsRequest(request, response).then((handled) => {
      if (!handled) response.writeHead(404).end()
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (path, data) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  for (const data of [
    { queryKey: 'unknown' },
    { queryKey: 'large', limit: 1001 },
    { queryKey: 'large', offset: -1 },
    { queryKey: 'large', sorting: [{ id: 'unknown', desc: false }] },
  ]) {
    const response = await post('/api/analytics/query', data)
    assert.equal(response.status, 400)
    assert.ok((await response.json()).error)
  }
  const page = await (
    await post('/api/analytics/query', { queryKey: 'large', offset: 99000 })
  ).json()
  assert.equal(page.totalRows, 100005)
  assert.equal(page.rows.length, 1000)
  assert.equal(page.rows[0].id, 'row-99000')
  const invalid = await post('/api/analytics/export', {
    queryKey: 'sales',
    columns: [{ id: 'unknown', label: 'Unknown' }],
  })
  assert.equal(invalid.status, 400)
  const ticket = await (
    await post('/api/analytics/export', {
      queryKey: 'sales',
      columns: [{ id: 'revenue', label: 'Total' }],
      sorting: [{ id: 'revenue', desc: true }],
    })
  ).json()
  const download = await fetch(base + ticket.url)
  assert.match(download.headers.get('content-disposition'), /analytics\.csv/)
  assert.equal(await download.text(), 'Total\r\n42\r\n7\r\n\r\n')
  assert.equal((await fetch(base + ticket.url)).status, 400)
})
