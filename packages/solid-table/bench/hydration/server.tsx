import { generateHydrationScript, renderToString } from '@solidjs/web'
import App from './App'

export const render = () =>
  generateHydrationScript() + renderToString(() => <App />)
