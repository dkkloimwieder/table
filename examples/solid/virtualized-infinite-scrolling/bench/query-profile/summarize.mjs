import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'

const filename = process.argv[2]
assert.ok(filename, 'Usage: node summarize.mjs REPORT.json [SUMMARY.json]')
const report = JSON.parse(await readFile(filename, 'utf8'))
const groups = new Map()
// Chrome can omit inlined outer frames, especially with smaller pages.
const deepFrames = new Set([
  'deep',
  'deepNext',
  'walkT',
  'snapshotNext',
  'snapshotWalk',
])
const range = (values) => ({
  min: Math.min(...values),
  max: Math.max(...values),
})
for (const sample of report.samples) {
  for (const step of sample.steps) {
    const key = `${sample.mode}/${sample.size}/${sample.structuralSharing}/${step.action}`
    let group = groups.get(key)
    if (!group) {
      group = {
        mode: sample.mode,
        size: sample.size,
        structuralSharing: sample.structuralSharing,
        action: step.action,
        samples: [],
      }
      groups.set(key, group)
    }
    const categories = { deep: 0, core: 0, other: 0 }
    if (report.allocations) {
      const path = `${filename}.allocations/${sample.mode}-${sample.size}-sharing-${sample.structuralSharing}-${sample.repeat}-${step.action}.json`
      const profile = JSON.parse(await readFile(path, 'utf8'))
      const nodeCategories = new Map()
      const walk = (node, category = 'other') => {
        const name = node.callFrame.functionName
        if (deepFrames.has(name)) category = 'deep'
        else if (name === '_createCoreRowModel') category = 'core'
        nodeCategories.set(node.id, category)
        for (const child of node.children) walk(child, category)
      }
      walk(profile.head)
      for (const sample of profile.samples) {
        assert.ok(
          nodeCategories.has(sample.nodeId),
          `${path}: missing sample stack`,
        )
        categories[nodeCategories.get(sample.nodeId)] += sample.size
      }
      assert.equal(
        categories.deep + categories.core + categories.other,
        step.sampledBytes,
        `${path}: sampled byte accounting`,
      )
    }
    group.samples.push({ ...step, categories })
  }
}
const summary = {
  browser: report.browser,
  versions: report.versions,
  distribution: report.distribution,
  pageSize: report.pageSize ?? 1000,
  contracts: report.contracts,
  measuredSamples: report.samples.length,
  measuredStates: report.samples.reduce(
    (total, sample) => total + sample.steps.length,
    0,
  ),
  load: range(
    report.samples.flatMap((sample) => [
      sample.loadBefore[0],
      sample.loadAfter[0],
    ]),
  ),
  groups: Array.from(groups.values(), ({ samples, ...group }) => ({
    ...group,
    counts: samples[0].counts,
    identities: Object.fromEntries(
      [
        'rows',
        'newRows',
        'newCoreRows',
        'sameArray',
        'sameModel',
        'staleCells',
        'changedOldRows',
      ].map((key) => [key, samples[0][key]]),
    ),
    timings: Object.fromEntries(
      ['update', 'bridge', 'model', 'total'].map((key) => [
        key,
        range(samples.map((sample) => sample.timings[key])),
      ]),
    ),
    ...(report.allocations
      ? {
          sampledBytes: range(samples.map((sample) => sample.sampledBytes)),
          categories: Object.fromEntries(
            ['deep', 'core', 'other'].map((key) => [
              key,
              range(samples.map((sample) => sample.categories[key])),
            ]),
          ),
        }
      : {}),
  })),
}
const output = process.argv[3] ?? `${filename}.summary.json`
await writeFile(output, JSON.stringify(summary, null, 2))
console.log(`Summary: ${output} (${summary.measuredStates} measured states)`)
