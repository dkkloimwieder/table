/** Source repairs against the immutable revision recorded by prepare.mjs. */
export function portSelect(code: string, id: string) {
  if (id.endsWith('/dismissable-layer/dismissable-layer.tsx')) {
    const before = '\t\t\t\t{...(others as any)}'
    if (!code.includes(before))
      throw new Error('Kobalte dismissable layer source changed')
    return (
      `import { ownedSelectEvents, selectEventProps } from "table-popup-owned-events";\n` +
      code
        .replace(
          '\t// TODO: restore <Polymorphic>',
          '\tconst domEvents = ownedSelectEvents(others);\n\tconst attributes = omit(others, ...selectEventProps);\n\t// TODO: restore <Polymorphic>',
        )
        .replace(
          '\t\t\t\t\tprops.ref,',
          '\t\t\t\t\tprops.ref,\n\t\t\t\t\tdomEvents,',
        )
        .replace(before, '\t\t\t\t{...attributes}')
    )
  }
  if (id.endsWith('/scroll/dist/preventScroll.js')) {
    const before = 'stack: createSignal([], { ownedWrite: true }),'
    if (!code.includes(before))
      throw new Error('Solid scroll registry source changed')
    // A window-wide signal must not inherit the first popup's component owner.
    return code
      .replace(
        'createEffect, createSignal }',
        'createEffect, createSignal, runWithOwner }',
      )
      .replace(
        before,
        'stack: runWithOwner(null, () => createSignal([], { ownedWrite: true })),',
      )
  }
  if (id.endsWith('/polymorphic/polymorphic.tsx')) {
    const before = 'return <Dynamic {...others} component={props.as} />;'
    if (!code.includes(before))
      throw new Error('Kobalte polymorphic source changed')
    return (
      `import { ownedSelectEvents, selectEventProps } from "table-popup-owned-events";\n` +
      code.replace(
        before,
        `
  if (typeof untrack(() => props.as) !== "string") {
    ${before}
  }
  const attributes = omit(others, "ref", ...selectEventProps);
  const events = ownedSelectEvents(props);
  // Refs bind at element creation. Keep this one-time callback read explicit.
  const forwardedRef = untrack(() => props.ref);
  return <Dynamic {...attributes} component={props.as} ref={[forwardedRef, events]} />;
`,
      )
    )
  }
  if (id.endsWith('/popper/popper-positioner.tsx')) {
    const before = `ref={
\t\t\t\t[
\t\t\t\t\tcontext.setPositionerRef,
\t\t\t\t\tprops.ref as (el: HTMLElement) => void,
\t\t\t\t] as any
\t\t\t}`
    if (!code.includes(before))
      throw new Error('Kobalte positioner ref source changed')
    // The rc.13 and rc.14 compilers drop a ref wrapped in a TypeScript assertion.
    // A plain array preserves both callbacks through JSX compilation.
    return code.replace(before, 'ref={[context.setPositionerRef, props.ref]}')
  }
  if (id.endsWith('/select/select-trigger.tsx')) {
    code = code.replace(
      'merge, omit, type Ref',
      'merge, omit, untrack, type Ref',
    )
    for (const name of ['onFocus', 'onBlur']) {
      const start = code.indexOf(`const ${name}:`)
      const end = code.indexOf('\n\t};', start) + 4
      if (start < 0 || end < 4)
        throw new Error(`Kobalte ${name} source changed`)
      const before = code.slice(start, end)
      code = code.replace(
        before,
        before.replace('=> {', '=> untrack(() => {').replace(/\};$/, '});'),
      )
    }
    return code
  }
  if (id.endsWith('/selection/create-selectable-collection.ts')) {
    code = code.replace('\tonSettled,', '\tonSettled,\n\tuntrack,')
    for (const name of ['onFocusIn', 'onFocusOut']) {
      const start = code.indexOf(`const ${name}:`)
      const end = code.indexOf('\n\t};', start) + 4
      if (start < 0 || end < 4)
        throw new Error(`Kobalte ${name} source changed`)
      const before = code.slice(start, end)
      code = code.replace(
        before,
        before.replace('=> {', '=> untrack(() => {').replace(/\};$/, '});'),
      )
    }
    const before = 'element.scrollIntoView({ block: "nearest" });'
    if (code.split(before).length !== 3)
      throw new Error('Kobalte collection scroll source changed')
    // Opening a portal must not scroll the document before Popper positions it.
    // Scroll the list's own viewport, including during keyboard navigation.
    return (
      code.replaceAll(before, 'scrollOptionIntoView(scrollEl, element);') +
      `
function scrollOptionIntoView(container: HTMLElement, element: Element) {
  const bounds = container.getBoundingClientRect();
  const item = element.getBoundingClientRect();
  const top = bounds.top + container.clientTop;
  const left = bounds.left + container.clientLeft;
  if (item.top < top) container.scrollTop += item.top - top;
  else if (item.bottom > top + container.clientHeight) container.scrollTop += item.bottom - top - container.clientHeight;
  if (item.left < left) container.scrollLeft += item.left - left;
  else if (item.right > left + container.clientWidth) container.scrollLeft += item.right - left - container.clientWidth;
}
`
    )
  }
  if (!id.endsWith('/selection/create-selectable-item.ts')) return
  const before = `const onFocus = (e: FocusEvent) => {
\t\tconst refEl = ref();

\t\tif (shouldUseVirtualFocus() || isDisabled() || !refEl) {
\t\t\treturn;
\t\t}

\t\tif (e.target === refEl) {
\t\t\tmanager().setFocusedKey(key());
\t\t}
\t};`
  if (!code.includes(before))
    throw new Error('Kobalte selectable-item source changed')
  // focus() can dispatch synchronously from a Solid effect. This event reads
  // current values once; the separate focus effect retains its tracked reads.
  return code
    .replace(
      'createEffect, createMemo }',
      'createEffect, createMemo, untrack }',
    )
    .replace(
      before,
      before.replace('=> {', '=> untrack(() => {').replace(/\};$/, '});'),
    )
}
