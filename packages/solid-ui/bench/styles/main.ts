import { uiDensity, uiScope } from '../../src/index'

function configure(
  id: string,
  density: 'compact' | 'comfortable',
  theme?: 'dark',
) {
  const node = document.getElementById(id)!
  const scope = uiScope(density, theme)
  node.setAttribute('data-ui', '')
  node.setAttribute('data-ui-density', scope['data-ui-density'])
  if (theme) node.setAttribute('data-ui-theme', theme)
  else node.removeAttribute('data-ui-theme')
  for (const [key, value] of Object.entries(scope.style))
    node.style.setProperty(key, value)
}
function outside() {
  return ['outside-button', 'outside-input', 'outside-table', 'unrelated'].map(
    (id) => {
      const style = getComputedStyle(document.getElementById(id)!)
      return [
        style.fontSize,
        style.fontFamily,
        style.backgroundColor,
        style.borderTopWidth,
        style.boxSizing,
        style.padding,
        style.margin,
      ]
    },
  )
}
const baseline = outside()
configure('light', 'compact')
configure('dark', 'compact', 'dark')
configure('comfortable', 'comfortable')
await import('../../src/styles/styles.css')
window.styleFixture = {
  baseline,
  outside,
  configure,
  rowHeight: (density: 'compact' | 'comfortable') =>
    uiDensity(density).rowHeight,
}

declare global {
  interface Window {
    styleFixture: {
      baseline: Array<Array<string>>
      outside: typeof outside
      configure: typeof configure
      rowHeight: (density: 'compact' | 'comfortable') => number
    }
  }
}
