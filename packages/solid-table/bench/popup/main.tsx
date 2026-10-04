import { render } from '@solidjs/web'
import { mountEditingFixture } from '../editing/fixture'
import { PopupPriorityEditor } from './PopupPriorityEditor'
import { Standalone } from './Standalone'

if (new URLSearchParams(location.search).has('standalone'))
  render(() => <Standalone />, document.getElementById('root')!)
else mountEditingFixture(PopupPriorityEditor)
