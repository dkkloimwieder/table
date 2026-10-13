import './style.css'
import { action, flush } from 'solid-js'
import { render } from '@solidjs/web'
import { mountEditingFixture } from '../editing/fixture'
import { popupFields } from '../editing/fields'
import { PopupPriorityEditor } from './PopupPriorityEditor'
import { Standalone } from './Standalone'
import { ChoiceControls } from './ChoiceControls'
import { ComboboxSmoke } from './ComboboxSmoke'
import { NativeFieldsFixture } from './NativeFieldsFixture'

if (new URLSearchParams(location.search).has('fields')) {
  const dispose = render(
    () => <NativeFieldsFixture />,
    document.getElementById('root')!,
  )
  // eslint-disable-next-line require-yield -- Use the qualified synchronous runtime disposal path.
  const cleanup = action(function* () {
    dispose()
  })
  window.nativeFieldFixture.stop = () => {
    cleanup()
    flush()
  }
} else if (new URLSearchParams(location.search).has('choices')) {
  const dispose = render(
    () => <ChoiceControls />,
    document.getElementById('root')!,
  )
  // eslint-disable-next-line require-yield -- Use the qualified synchronous runtime disposal path.
  const cleanup = action(function* () {
    dispose()
  })
  window.choiceFixture.stop = () => {
    cleanup()
    flush()
  }
} else if (new URLSearchParams(location.search).has('combobox'))
  render(() => <ComboboxSmoke />, document.getElementById('root')!)
else if (new URLSearchParams(location.search).has('standalone'))
  render(() => <Standalone />, document.getElementById('root')!)
else mountEditingFixture(PopupPriorityEditor, popupFields)
