import { For, createSignal, onCleanup } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import type { TableViews as Views } from './createTableViews'

/** The parent supplies configuration to Table and owns these view controls. */
export function TableViews(props: { views: Views; locked: boolean }) {
  const [name, setName] = createSignal('')
  let element!: HTMLElement
  let cancelFocus: (() => void) | undefined
  onCleanup(() => cancelFocus?.())
  function perform(target: HTMLElement, work: () => Promise<boolean>) {
    if (props.locked || props.views.busy()) return
    cancelFocus?.()
    let active = true
    let restore = document.activeElement === target
    let frame: number | undefined
    const interrupt = () => {
      restore = false
    }
    const cleanup = () => {
      active = false
      document.removeEventListener('pointerdown', interrupt, true)
      document.removeEventListener('keydown', interrupt, true)
      document.removeEventListener('focusin', interrupt, true)
      if (frame !== undefined) cancelAnimationFrame(frame)
      if (cancelFocus === cleanup) cancelFocus = undefined
    }
    cancelFocus = cleanup
    document.addEventListener('pointerdown', interrupt, true)
    document.addEventListener('keydown', interrupt, true)
    document.addEventListener('focusin', interrupt, true)
    const finish = () => {
      if (!active) return
      frame = requestAnimationFrame(() => {
        if (
          restore &&
          target.isConnected &&
          document.activeElement === document.body
        ) {
          const control = target.matches(':disabled')
            ? element.querySelector<HTMLElement>(
                props.views.views().length ? 'select' : 'input',
              )
            : target
          control?.focus({ preventScroll: true })
        }
        cleanup()
      })
    }
    void work().then(finish, finish)
  }
  return (
    <section ref={element} class="table-views" aria-label="Named views">
      <fieldset disabled={props.locked || props.views.busy()}>
        <legend>Views</legend>
        <div class="view-controls">
          <label>
            Saved view
            <select
              value={props.views.selected()}
              ref={nativeEvents<HTMLSelectElement>({
                change: (event) => {
                  if (!props.views.choose(event.currentTarget.value))
                    event.currentTarget.value = props.views.selected()
                },
              })}
            >
              <option value="" disabled>
                Choose a view
              </option>
              <For each={props.views.views()}>
                {(view) => <option value={view.id}>{view.name}</option>}
              </For>
            </select>
          </label>
          <button
            disabled={!props.views.selected()}
            ref={nativeEvents({
              click: (event) => {
                perform(event.currentTarget, props.views.update)
              },
            })}
          >
            Update view
          </button>
          <label>
            View name
            <input
              value={name()}
              maxlength={80}
              ref={nativeEvents<HTMLInputElement>({
                input: (event) => setName(event.currentTarget.value),
              })}
            />
          </label>
          <button
            disabled={!name().trim()}
            ref={nativeEvents({
              click: (event) => {
                perform(event.currentTarget, () => props.views.saveAs(name()))
              },
            })}
          >
            Save as new view
          </button>
          <button
            disabled={!name().trim() || !props.views.selected()}
            ref={nativeEvents({
              click: (event) => {
                perform(event.currentTarget, () => props.views.rename(name()))
              },
            })}
          >
            Rename view
          </button>
          <button
            disabled={!props.views.selected()}
            ref={nativeEvents({
              click: (event) => {
                perform(event.currentTarget, props.views.remove)
              },
            })}
          >
            Delete view
          </button>
          <button
            ref={nativeEvents({
              click: (event) => {
                perform(event.currentTarget, props.views.reload)
              },
            })}
          >
            Reload views
          </button>
        </div>
      </fieldset>
      <p class="view-status" role={props.views.error() ? 'alert' : 'status'}>
        {props.views.error() ||
          (props.views.busy()
            ? 'Loading or saving views…'
            : props.views.message())}
      </p>
    </section>
  )
}
