export const UI_DENSITIES = {
  compact: {
    rowHeight: 32,
    controlHeight: 26,
    headerHeight: 22,
    fontSize: 12,
    smallFontSize: 11,
    cellPaddingY: 6,
    cellPaddingX: 8,
    controlPaddingY: 4,
    gap: 6,
  },
  comfortable: {
    rowHeight: 40,
    controlHeight: 34,
    headerHeight: 28,
    fontSize: 12,
    smallFontSize: 12,
    cellPaddingY: 10,
    cellPaddingX: 8,
    controlPaddingY: 8,
    gap: 8,
  },
} as const

export type UIDensity = keyof typeof UI_DENSITIES

export function uiDensity(density: UIDensity = 'compact') {
  return UI_DENSITIES[density]
}

/** Supply this same density to fixed row geometry and the owning UI scope. */
export function uiScope(density: UIDensity = 'compact', theme?: 'dark') {
  const value = uiDensity(density)
  return {
    'data-ui': '',
    'data-ui-density': density,
    'data-ui-theme': theme,
    style: {
      '--ui-row-height': `${value.rowHeight}px`,
      '--ui-control-height': `${value.controlHeight}px`,
      '--ui-header-height': `${value.headerHeight}px`,
      '--ui-font-size': `${value.fontSize}px`,
      '--ui-small-font-size': `${value.smallFontSize}px`,
      '--ui-cell-padding-y': `${value.cellPaddingY}px`,
      '--ui-cell-padding-x': `${value.cellPaddingX}px`,
      '--ui-control-padding-y': `${value.controlPaddingY}px`,
      '--ui-gap': `${value.gap}px`,
    },
  }
}
