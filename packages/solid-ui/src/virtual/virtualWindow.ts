/** Geometry shared by fixed-height and measured virtual rendering. */
export interface VirtualWindow<Key extends string | number> {
  readonly mode: 'fixed' | 'measured'
  getKeys: () => ReadonlyArray<Key>
  getStart: () => number
  getEnd: () => number
  getTotalSize: () => number
  scrollToIndex: (index: number) => void
}
