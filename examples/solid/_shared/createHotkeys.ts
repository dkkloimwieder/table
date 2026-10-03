import { HotkeyManager } from '@tanstack/hotkeys'
import { createEffect, onSettled } from 'solid-js'
import type {
  Hotkey,
  HotkeyCallback,
  HotkeyOptions,
  HotkeyRegistrationHandle,
} from '@tanstack/hotkeys'

export function createHotkeys(
  hotkeys: Array<{ hotkey: Hotkey; callback: HotkeyCallback }>,
  options: () => HotkeyOptions,
) {
  let handles: Array<HotkeyRegistrationHandle> = []
  createEffect(options, (value) => {
    handles.forEach((handle) => handle.setOptions(value))
  })
  onSettled(() => {
    const manager = HotkeyManager.getInstance()
    handles = hotkeys.map(({ hotkey, callback }) =>
      manager.register(hotkey, callback, options()),
    )
    return () => handles.forEach((handle) => handle.unregister())
  })
}
