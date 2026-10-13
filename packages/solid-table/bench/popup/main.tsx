import { render } from '@solidjs/web'
import { mountEditingFixture } from '../editing/fixture'
import { popupFields } from '../editing/fields'
import { PopupPriorityEditor } from './PopupPriorityEditor'
import { Standalone } from './Standalone'
import { ComboboxSmoke } from './ComboboxSmoke'

if (new URLSearchParams(location.search).has('combobox'))
  render(() => <ComboboxSmoke />, document.getElementById('root')!)
else if (new URLSearchParams(location.search).has('standalone'))
  render(() => <Standalone />, document.getElementById('root')!)
else mountEditingFixture(PopupPriorityEditor, popupFields)
