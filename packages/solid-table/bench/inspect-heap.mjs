import { readFile, writeFile } from 'node:fs/promises'

const file = process.argv[2]
if (!file) throw new Error('Pass a Chrome .heapsnapshot path.')
const heap = JSON.parse(await readFile(file, 'utf8'))
const { nodes, edges, strings } = heap
const meta = heap.snapshot.meta
const nf = meta.node_fields.length
const ef = meta.edge_fields.length
const ni = Object.fromEntries(meta.node_fields.map((name, i) => [name, i]))
const ei = Object.fromEntries(meta.edge_fields.map((name, i) => [name, i]))
const nodeTypes = meta.node_types[ni.type]
const edgeTypes = meta.edge_types[ei.type]
const count = nodes.length / nf
const offsets = new Uint32Array(count + 1)
const groups = new Map()
const shapes = new Map()
const categories = new Map()
const backing = new Uint8Array(count)
const allocationTemplates = new Uint8Array(count)
let templateEdge = 0
for (let i = 0; i < count; i++) {
  const base = i * nf
  const length = nodes[base + ni.edge_count] * ef
  if (
    nodeTypes[nodes[base + ni.type]] === 'code' &&
    strings[nodes[base + ni.name]] === 'system / AllocationSite'
  ) {
    for (let edge = templateEdge; edge < templateEdge + length; edge += ef) {
      if (
        edgeTypes[edges[edge + ei.type]] === 'internal' &&
        strings[edges[edge + ei.name_or_index]] === 'transition_info'
      )
        allocationTemplates[edges[edge + ei.to_node] / nf] = 1
    }
  }
  templateEdge += length
}
let total = 0
let cursor = 0
const add = (map, key, index, size) => {
  const group = map.get(key) ?? {
    key,
    count: 0,
    shallowBytes: 0,
    sample: index,
  }
  group.count++
  group.shallowBytes += size
  group.sample = index
  map.set(key, group)
}
for (let i = 0; i < count; i++) {
  const base = i * nf
  offsets[i] = cursor
  const type = nodeTypes[nodes[base + ni.type]]
  const name = strings[nodes[base + ni.name]]
  const size = nodes[base + ni.self_size]
  const length = nodes[base + ni.edge_count] * ef
  const key = ['object', 'closure', 'array', 'native', 'hidden'].includes(type)
    ? `${type}:${name}`
    : type
  add(groups, key, i, size)
  if (type === 'object' && name === 'Object') {
    const keys = []
    for (let edge = cursor; edge < cursor + length; edge += ef) {
      if (edgeTypes[edges[edge + ei.type]] === 'property')
        keys.push(strings[edges[edge + ei.name_or_index]])
    }
    add(shapes, keys.sort().join(','), i, size)
  }
  const properties = new Set()
  const contexts = new Set()
  let stringId = false
  for (let edge = cursor; edge < cursor + length; edge += ef) {
    const kind = edgeTypes[edges[edge + ei.type]]
    if (kind === 'property') {
      properties.add(strings[edges[edge + ei.name_or_index]])
      if (strings[edges[edge + ei.name_or_index]] === 'id') {
        const target = edges[edge + ei.to_node]
        stringId = nodeTypes[nodes[target + ni.type]].includes('string')
      }
    }
    if (kind === 'context')
      contexts.add(strings[edges[edge + ei.name_or_index]])
  }
  let category
  if (allocationTemplates[i]) category = 'V8 allocation templates'
  else if (properties.has('_valuesCache') && properties.has('original'))
    category = 'Table rows'
  else if (
    properties.has('itemSizeCache') &&
    properties.has('elementsCache') &&
    properties.has('measureElement')
  )
    category = 'Virtualizer instances'
  else if (
    properties.has('start') &&
    properties.has('end') &&
    properties.has('size') &&
    properties.has('index') &&
    properties.has('key') &&
    properties.has('lane')
  )
    category = 'Virtual geometry items'
  else if (properties.has('getVisibleCells') && properties.has('getLeafRowIds'))
    category = 'Native group views'
  else if (
    properties.has('leafIds') &&
    properties.has('children') &&
    properties.has('path')
  )
    category = 'Native group membership nodes'
  else if (
    properties.has('column') &&
    properties.has('group') &&
    properties.has('id')
  )
    category = 'Native group cells'
  else if (properties.has('getVisibleCells') && properties.has('getValue'))
    category = 'Native row views'
  else if (
    properties.has('column') &&
    properties.has('row') &&
    properties.has('id')
  )
    category = 'Table cells'
  else if (
    properties.has('acc') &&
    properties.has('pxv') &&
    properties.has('Bn')
  )
    category = 'Solid store property signals'
  else if (
    properties.has('Wn') &&
    properties.has('dispose') &&
    properties.has('_parent')
  )
    category = 'Solid owner scopes'
  else if (
    properties.has('he') &&
    properties.has('Ie') &&
    properties.has('_parent')
  )
    category = 'Solid computations and effects'
  else if (
    properties.has('Oe') &&
    properties.has('ge') &&
    properties.has('Ne') &&
    properties.has('Ae')
  )
    category = 'Solid dependency links'
  else if (properties.has('De') && properties.has('Ue') && properties.has('Yn'))
    category = 'Solid plain signals'
  else if (type === 'object' && name === 'TargetShape')
    category = 'Solid store targets'
  else if (type === 'object' && name === 'Map') category = 'JavaScript Maps'
  else if (contexts.has('values') && contexts.has('uniqueValues'))
    category = 'Prototype row closure contexts'
  else if (
    stringId &&
    ((properties.has('name') &&
      properties.has('details') &&
      properties.has('region')) ||
      (properties.has('name') &&
        properties.has('color') &&
        properties.has('tags') &&
        properties.has('score')) ||
      (properties.has('name') &&
        properties.has('description') &&
        properties.has('region') &&
        properties.has('amount')) ||
      (properties.has('region') &&
        properties.has('city') &&
        properties.has('amount')) ||
      (properties.has('name') &&
        properties.has('note') &&
        properties.has('revision')) ||
      (properties.has('code') &&
        properties.has('createdAt') &&
        properties.has('editVersion') &&
        properties.has('makerId') &&
        properties.has('note')))
  )
    category = 'Data records'
  if (category) {
    let bytes = size
    for (let edge = cursor; edge < cursor + length; edge += ef) {
      if (edgeTypes[edges[edge + ei.type]] !== 'internal') continue
      const label = strings[edges[edge + ei.name_or_index]]
      if (!['properties', 'elements', 'table'].includes(label)) continue
      const target = edges[edge + ei.to_node] / nf
      if (!backing[target]) {
        backing[target] = 1
        bytes += nodes[target * nf + ni.self_size]
      }
    }
    add(categories, category, i, bytes)
  }
  total += size
  cursor += length
}
offsets[count] = cursor

// Shortest paths through strong snapshot edges. These show retaining chains,
// not dominator retained sizes. Weak edges are deliberately excluded.
const parents = new Int32Array(count).fill(-1)
const parentEdges = new Int32Array(count).fill(-1)
const queue = new Uint32Array(count)
parents[0] = 0
queue[0] = 0
let tail = 1
for (let head = 0; head < tail; head++) {
  const source = queue[head]
  for (let edge = offsets[source]; edge < offsets[source + 1]; edge += ef) {
    const edgeType = edgeTypes[edges[edge + ei.type]]
    if (edgeType === 'weak') continue
    // WeakMap pair edges are conditional ephemerons, not independent strong
    // roots. Exclude them from displayed retaining paths as well.
    if (
      edgeType === 'internal' &&
      strings[edges[edge + ei.name_or_index]]?.includes('part of key')
    )
      continue
    const target = edges[edge + ei.to_node] / nf
    if (parents[target] !== -1) continue
    parents[target] = source
    parentEdges[target] = edge
    queue[tail++] = target
  }
}
const describe = (index) => ({
  index,
  id: nodes[index * nf + ni.id],
  type: nodeTypes[nodes[index * nf + ni.type]],
  name: strings[nodes[index * nf + ni.name]],
  shallowBytes: nodes[index * nf + ni.self_size],
})
const path = (index) => {
  const steps = []
  while (index && steps.length < 100 && parents[index] !== -1) {
    const edge = parentEdges[index]
    const type = edgeTypes[edges[edge + ei.type]]
    const label = ['element', 'hidden'].includes(type)
      ? edges[edge + ei.name_or_index]
      : strings[edges[edge + ei.name_or_index]]
    steps.push({ ...describe(index), via: `${type}:${label}` })
    index = parents[index]
  }
  steps.push(describe(index))
  return steps.reverse()
}
const summarize = (map) =>
  [...map.values()]
    .sort((a, b) => b.shallowBytes - a.shallowBytes)
    .slice(0, 80)
    .map((group) => ({ ...group, retainingPath: path(group.sample) }))
const result = {
  file,
  nodes: count,
  edges: edges.length / ef,
  snapshotShallowBytes: total,
  strongReachableNodes: tail,
  note: 'Category sizes sum object self sizes. They are not exclusive dominator retained sizes. Paths exclude weak edges.',
  groups: summarize(groups),
  shapes: summarize(shapes),
  categories: summarize(categories),
  categoryNote:
    'Self sizes plus directly owned property/element/Map tables, counted once. No transitive retained-size claim. Runtime shapes match Solid rc.13. V8 allocation-site templates have a separate category, not live instance counts.',
}
await writeFile(file + '.summary.json', JSON.stringify(result, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      nodes: count,
      edges: edges.length / ef,
      MiB: total / 2 ** 20,
      top: result.groups.slice(0, 25).map(({ key, count, shallowBytes }) => ({
        key,
        count,
        MiB: +(shallowBytes / 2 ** 20).toFixed(2),
      })),
      shapes: result.shapes
        .slice(0, 12)
        .map(({ key, count, shallowBytes }) => ({
          key,
          count,
          MiB: +(shallowBytes / 2 ** 20).toFixed(2),
        })),
    },
    null,
    2,
  ),
)
