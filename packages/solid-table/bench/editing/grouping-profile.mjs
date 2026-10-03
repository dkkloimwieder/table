import assert from 'node:assert/strict'

export async function groupingProfile({ page, call, start, settle }) {
  await start(500, 'table')
  await call('grouping', ['priority'])
  await call('traceStart')
  const before = await call('traceRead')
  if (!before.graph.owners) {
    await call('traceStop')
    return undefined
  }
  try {
    // Force one aggregate and then expand leaves. Capture both creation and
    // rerun dependencies, including bindings that have never changed yet.
    await call('summary', 'amount', 'median')
    await call('expandGroups', true)
    await settle()
    const expanded = await call('traceRead')
    assert.ok(
      expanded.runs.length > 500,
      'Attribution must actually observe the rendered records',
    )
    const editReaders = expanded.runs.filter((run) =>
      run.sources.some((source) => /createEditing\.drafts/.test(source)),
    )
    assert.deepEqual(
      editReaders,
      [],
      'Read-only grouped rendering must not subscribe to drafts',
    )
    assert.equal(await page.locator('[data-edit], [data-editor]').count(), 0)
    await call('expandGroups', false)
    await settle()
    await call('traceStop')
    await call('traceStart')
    // With no visible records, the group summary does not subscribe to the
    // parent-keyed child lookup. Programmatic loads exercise that isolation.
    await call('childToggle', 'R0001')
    await page.waitForFunction(
      () => window.editingFixture.childStatus('R0001') === 'ready',
    )
    const hiddenChild = await call('traceRead')
    const summaryReaders = hiddenChild.runs.filter((run) =>
      /createGroupView|createNativeGrouping/.test(run.name),
    )
    assert.deepEqual(summaryReaders, [])
    assert.equal(await page.locator('[data-subtable]').count(), 0)
    return { expanded, hiddenChild }
  } finally {
    await call('traceStop')
  }
}
