# Shared styles

Applications explicitly import `@table/ui/styles.css`.
All selectors stay inside a `data-ui` scope. The stylesheet leaves unrelated content unchanged.
Table editors and standalone controls share fonts, spacing, borders, colors, focus, and disabled states.
Fixture page layout stays outside this package.

## Scope and density

Use `uiScope()` on a wrapper that contains the controls.
Compact density remains the default. Comfortable density increases spacing and row height.

```tsx
import { uiDensity, uiScope } from '@table/ui'
import '@table/ui/styles.css'

const density = 'compact'
const rowHeight = uiDensity(density).rowHeight

<div {...uiScope(density)}>
  <button type="button">Export</button>
</div>
```

Pass the same density to fixed row geometry and its UI scope.
`UI_DENSITIES` provides both CSS values and virtual row height.
Compact rows use 32 pixels. Comfortable rows use 40 pixels.
Do not override `--ui-row-height` independently of the virtual row configuration.
Measured rows keep their existing measurement behavior.

## Themes and portals

Use `uiScope(density, 'dark')` for the optional dark theme.
Applications can override `--ui-*` variables inside a scope.
Theme variables change colors without changing geometry.
Each wrapper owns its density and theme.
Nested scopes inherit theme variables unless the application overrides them.

Mount popup portals inside the owning UI scope and outside the table scroller.
The fixture marks this wrapper with `data-ui-portal-root` and passes it to `Portal.mount`.
Popups inherit live theme values without copying styles or adding observers.

## Browser evidence

The isolated fixture in `../../bench/styles` tests scope isolation, independent themes, row sizes, and visible focus.
Analytics tests compare CSS row height with virtual geometry after density changes.
Popup tests keep popup size and placement stable through a live theme change.
The standard Solid qualification command runs these tests with the existing fixture suites.
