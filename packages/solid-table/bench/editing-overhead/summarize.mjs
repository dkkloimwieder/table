import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

const paths = process.argv.slice(2)
assert.ok(paths.length > 0, 'Pass one or more benchmark reports.')
const reports = await Promise.all(
  paths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
)
for (const report of reports) assert.deepEqual(report.failures, [])
const range = (values) => {
  const sorted = values.toSorted((a, b) => a - b)
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted.at(-1),
  }
}
const contract = (sample) =>
  sample.stages.map(({ name, result: { elapsedMs, ...result } }) => ({
    name,
    result,
  }))
const references = new Map()
const heapReferences = new Map()
const applicationCategories = [
  'Data records',
  'Native row views',
  'Table cells',
  'Solid store targets',
  'Solid store property signals',
  'Solid computations and effects',
  'Solid dependency links',
  'Solid owner scopes',
  'Solid plain signals',
]
const summary = reports.map((report, index) => {
  const groups = new Map()
  for (const sample of report.samples) {
    const key = `${sample.size}/${sample.mode}`
    for (const stage of [
      ...sample.stages,
      { name: 'disposed', heap: sample.disposed.heap },
    ]) {
      if (!stage.heap) continue
      const heapKey = `${key}/${stage.name}`
      const counts = Object.fromEntries(
        applicationCategories.map((category) => [
          category,
          stage.heap.categories[category]?.count ?? 0,
        ]),
      )
      if (heapReferences.has(heapKey))
        assert.deepEqual(
          counts,
          heapReferences.get(heapKey),
          `${heapKey}: source/distribution heap counts differ`,
        )
      else heapReferences.set(heapKey, counts)
    }
    const saved = sample.stages.find((stage) => stage.name === 'saved')
    if (sample.mode === 'editable')
      assert.equal(saved.result.values[1], 'Saved name')
    if (references.has(key))
      assert.deepEqual(
        contract(sample),
        references.get(key),
        `${key}: source/distribution work differs`,
      )
    else references.set(key, contract(sample))
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(sample)
  }
  const measurements = [...groups].map(([key, samples]) => ({
    key,
    samples: samples.length,
    stages: samples[0].stages.map(({ name, result, heap }) => ({
      name,
      heapDeltaBytes: range(
        samples.map(
          (sample) =>
            sample.stages.find((stage) => stage.name === name).heapUsedDelta,
        ),
      ),
      heapDeltaFromUpdatedBytes: range(
        samples.map(
          (sample) =>
            sample.stages.find((stage) => stage.name === name).heapUsedDelta -
            sample.stages.find((stage) => stage.name === 'updated')
              .heapUsedDelta,
        ),
      ),
      elapsedMs: range(
        samples.map(
          (sample) =>
            sample.stages.find((stage) => stage.name === name).result.elapsedMs,
        ),
      ),
      result: Object.fromEntries(
        Object.entries(result).filter(([key]) => key !== 'elapsedMs'),
      ),
      categories: heap?.categories,
    })),
  }))
  const contrasts = []
  for (const size of [
    ...new Set(report.samples.map((sample) => sample.size)),
  ]) {
    for (const [left, right] of [
      ['store', 'controller'],
      ['store', 'model'],
      ['model', 'read-only'],
      ['read-only', 'editable'],
    ]) {
      const a = groups.get(`${size}/${left}`)
      const b = groups.get(`${size}/${right}`)
      if (!a || !b) continue
      const pairs = a.map((sample) => {
        const other = b.find((item) => item.repeat === sample.repeat)
        assert.ok(other, 'Missing matched repetition')
        if (left === 'read-only' && right === 'editable') {
          for (const name of ['mounted', 'updated']) {
            const ra = sample.stages.find((stage) => stage.name === name).result
            const rb = other.stages.find((stage) => stage.name === name).result
            for (const key of [
              'first',
              'rowIds',
              'columns',
              'counts',
              'values',
              'identity',
            ])
              assert.deepEqual(
                ra[key],
                rb[key],
                `${size}/${name}: unmatched ${key} between presentations`,
              )
          }
        }
        const mountedA = sample.stages[0]
        const mountedB = other.stages[0]
        return {
          repeat: sample.repeat,
          heapDeltaBytes: mountedB.heapUsedDelta - mountedA.heapUsedDelta,
          elapsedDeltaMs: mountedB.result.elapsedMs - mountedA.result.elapsedMs,
          elements: mountedB.result.elements - mountedA.result.elements,
          listeners:
            mountedB.metrics.JSEventListeners -
            mountedA.metrics.JSEventListeners,
        }
      })
      contrasts.push({
        size,
        left,
        right,
        pairs,
        heapDeltaBytes: range(pairs.map((pair) => pair.heapDeltaBytes)),
        elapsedDeltaMs: range(pairs.map((pair) => pair.elapsedDeltaMs)),
      })
    }
  }
  const loads = report.samples.flatMap((sample) => [
    sample.before.load[0],
    ...sample.stages.map((stage) => stage.host.load[0]),
    sample.after.load[0],
  ])
  return {
    file: paths[index],
    directory: report.directory,
    browser: report.browser,
    samples: report.samples.length,
    states: report.samples.reduce(
      (sum, sample) => sum + sample.stages.length,
      0,
    ),
    cpuCount: report.cpuCount,
    loadOneMinute: range(loads),
    measurements,
    contrasts,
  }
})
const output = paths[0] + '.summary.json'
await writeFile(
  output,
  JSON.stringify(
    {
      matchedContracts: references.size,
      matchedHeapContracts: heapReferences.size,
      reports: summary,
      note: 'Post-GC memory contrasts use each page baseline. The shared fixture model includes its editing controller and demo state. Isolated controller contrasts are not additive decompositions of that model. Timing is advisory on a shared host. Snapshot categories are object counts and shallow sizes, not transitive retained sizes.',
    },
    null,
    2,
  ) + '\n',
)
console.log(
  `Matched ${references.size} exact contracts and ${heapReferences.size} heap resource groups across ${summary.length} builds. Summary: ${output}`,
)
for (const report of summary) {
  console.log(
    `${report.directory}: ${report.samples} samples, ${report.states} states, one-minute load ${JSON.stringify(report.loadOneMinute)}`,
  )
  for (const contrast of report.contrasts)
    console.log(
      `${contrast.size} ${contrast.left} -> ${contrast.right}: heap bytes ${JSON.stringify(contrast.heapDeltaBytes)}, mount ms ${JSON.stringify(contrast.elapsedDeltaMs)}`,
    )
}
