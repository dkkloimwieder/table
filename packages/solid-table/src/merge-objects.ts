/**
 * Merges objects together while keeping their getters alive.
 * Taken from SolidJS: {https://github.com/solidjs/solid/blob/24abc825c0996fd2bc8c1de1491efe9a7e743aff/packages/solid/src/server/rendering.ts#L82-L115}
 *
 * Vendored instead of importing `mergeProps` from `solid-js` because Solid 2
 * renames `mergeProps` to `merge` and changes its semantics: a present-but-
 * `undefined` value overrides earlier sources instead of being skipped. The
 * adapter's `mergeOptions` binding is called as `mergeOptions(table.options,
 * newOptions)`, and `table.options` carries every feature default, so the
 * ubiquitous wrapper pattern `{ onSortingChange: props.onSortingChange }` with
 * an unset optional prop would erase the default `makeStateUpdater` handler and
 * silently break that state slice. Solid 2 also ships the new semantics under
 * the old `mergeProps` name in `@solidjs/web`, so nothing in this package may
 * import either binding.
 *
 * One deliberate difference from Solid 1's `mergeProps` and from the Svelte
 * adapter's copy of this file: a key whose only descriptors are plain values of
 * `undefined` is left off the result entirely instead of being defined as an
 * `undefined`-yielding property. `constructTable` spreads the options
 * (`{ ...defaultOptions, ...tableOptions }`), and an own key holding
 * `undefined` overrides the feature default there even though every merge along
 * the way skips it.
 * */
export function mergeObjects<T>(source: T): T
export function mergeObjects<T, U>(source: T, source1: U): T & U
export function mergeObjects<T, U, V>(
  source: T,
  source1: U,
  source2: V,
): T & U & V
export function mergeObjects<T, U, V, W>(
  source: T,
  source1: U,
  source2: V,
  source3: W,
): T & U & V & W
export function mergeObjects(...sources: any): any {
  const target = {}
  for (let source of sources) {
    if (typeof source === 'function') source = source()
    if (source) {
      const descriptors = Object.getOwnPropertyDescriptors(source)
      for (const key in descriptors) {
        if (key in target) continue
        if (!isKeyDefined(sources, key)) continue
        Object.defineProperty(target, key, {
          enumerable: true,
          get() {
            for (let i = sources.length - 1; i >= 0; i--) {
              let v,
                s = sources[i]
              if (typeof s === 'function') s = s()
              // eslint-disable-next-line prefer-const
              v = (s || {})[key]
              if (v !== undefined) return v
            }
          },
        })
      }
    }
  }
  return target
}

/**
 * Reports whether any source can contribute a value for `key`.
 *
 * A getter or a function source always counts, because resolving either one
 * here would defeat the lazy reads this merge exists to preserve; a plain
 * `undefined` value never counts.
 */
function isKeyDefined(sources: Array<any>, key: string): boolean {
  for (let i = sources.length - 1; i >= 0; i--) {
    const s = sources[i]
    if (!s) continue
    if (typeof s === 'function') return true
    const descriptor = Object.getOwnPropertyDescriptor(s, key)
    if (!descriptor) continue
    if (descriptor.get || descriptor.value !== undefined) return true
  }
  return false
}

/**
 * Merges objects together by eagerly resolving all values into a flat object.
 *
 * Unlike `mergeObjects`, this does NOT preserve getters — values are read once
 * and stored as plain data properties. This prevents the getter-chain
 * accumulation that causes O(N) lookups when the result is repeatedly passed
 * back as a source in subsequent merges (e.g., inside an options-sync effect).
 *
 * Later sources take precedence; `undefined` values do not override.
 *
 * @see https://github.com/TanStack/table/issues/6235
 */
export function flatMerge<T>(source: T): T
export function flatMerge<T, U>(source: T, source1: U): T & U
export function flatMerge<T, U, V>(source: T, source1: U, source2: V): T & U & V
export function flatMerge<T, U, V, W>(
  source: T,
  source1: U,
  source2: V,
  source3: W,
): T & U & V & W
export function flatMerge(...sources: any): any {
  const result: Record<PropertyKey, unknown> = {}
  for (let source of sources) {
    if (typeof source === 'function') source = source()
    if (!source) continue
    for (const key of Reflect.ownKeys(source)) {
      const value = (source as Record<PropertyKey, unknown>)[key]
      if (value !== undefined) {
        result[key as string] = value
      }
    }
  }
  return result
}
