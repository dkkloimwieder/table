import {
  Button,
  Dialog,
  DropdownMenu,
  Input,
  Popover,
  Tooltip,
  uiScope,
} from '@table/ui'
import { createSignal, flush, onCleanup } from 'solid-js'

export function OverlayControls() {
  const [popover, setPopover] = createSignal(false)
  const [menu, setMenu] = createSignal(false)
  const [dialog, setDialog] = createSignal(false)
  const [accept, setAccept] = createSignal(true)
  const [modal, setModal] = createSignal(false)
  const [forceMount, setForceMount] = createSignal(false)
  const [prevent, setPrevent] = createSignal(false)
  const [disabled, setDisabled] = createSignal(false)
  const [checked, setChecked] = createSignal(false)
  const [radio, setRadio] = createSignal('compact')
  let actions = 0
  let requests = 0
  let cleanups = 0
  let refs = 0
  onCleanup(() => {
    cleanups++
  })
  window.overlayFixture = {
    configure(next) {
      if ('popover' in next) setPopover(next.popover!)
      if ('menu' in next) setMenu(next.menu!)
      if ('modal' in next) setModal(next.modal!)
      if ('accept' in next) setAccept(next.accept!)
      if ('forceMount' in next) setForceMount(next.forceMount!)
      if ('prevent' in next) setPrevent(next.prevent!)
      if ('disabled' in next) setDisabled(next.disabled!)
      flush()
    },
    read: () => ({
      popover: popover(),
      menu: menu(),
      dialog: dialog(),
      checked: checked(),
      radio: radio(),
      actions,
      requests,
      cleanups,
      refs,
    }),
  }
  const preventEvent = (event: Event) => {
    if (prevent()) event.preventDefault()
  }
  return (
    <main
      {...uiScope()}
      data-ui-portal-root=""
      data-ui-theme={
        new URLSearchParams(location.search).has('dark') ? 'dark' : undefined
      }
    >
      <h1>Contextual controls</h1>
      <Button id="outside">Outside action</Button>
      <Popover
        open={popover()}
        modal={modal()}
        forceMount={forceMount()}
        onOpenChange={(value) => {
          requests++
          if (accept()) setPopover(value)
        }}
      >
        <Popover.Trigger
          as={Button}
          ref={() => {
            refs++
          }}
          onClick={preventEvent}
        >
          Open popover
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            as="section"
            data-content="popover"
            ref={() => {
              refs++
            }}
            onEscapeKeyDown={preventEvent}
            onPointerDownOutside={preventEvent}
            onFocusOutside={preventEvent}
          >
            <Popover.Title>Display options</Popover.Title>
            <Popover.Description>
              The application owns these values.
            </Popover.Description>
            <Input aria-label="Display name" defaultValue="Example" />
            <Popover.CloseButton
              aria-label="Close popover"
              onClick={preventEvent}
            >
              Close popover
            </Popover.CloseButton>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
      <DropdownMenu
        open={menu()}
        modal={modal()}
        forceMount={forceMount()}
        onOpenChange={(value) => {
          requests++
          if (accept()) setMenu(value)
        }}
      >
        <DropdownMenu.Trigger
          as={Button}
          disabled={disabled()}
          onPointerDown={preventEvent}
          onKeyDown={preventEvent}
        >
          Open menu
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            as="section"
            onEscapeKeyDown={preventEvent}
            onPointerDownOutside={preventEvent}
            onFocusOutside={preventEvent}
          >
            <DropdownMenu.Group>
              <DropdownMenu.GroupLabel>
                Application actions
              </DropdownMenu.GroupLabel>
              <DropdownMenu.Item
                onSelect={() => {
                  actions++
                }}
              >
                Run action
              </DropdownMenu.Item>
              <DropdownMenu.Item
                disabled
                onSelect={() => {
                  actions += 100
                }}
              >
                Unavailable action
              </DropdownMenu.Item>
              <DropdownMenu.Item
                closeOnSelect={false}
                onKeyDown={preventEvent}
                onPointerUp={preventEvent}
                onSelect={() => {
                  actions++
                }}
              >
                Keep menu open
              </DropdownMenu.Item>
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <DropdownMenu.CheckboxItem
              checked={checked()}
              onChange={setChecked}
            >
              Show totals
              <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.RadioGroup value={radio()} onChange={setRadio}>
              <DropdownMenu.RadioItem value="compact">
                Compact
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="comfortable">
                Comfortable
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger>More actions</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent>
                  <DropdownMenu.Item
                    onSelect={() => {
                      actions++
                    }}
                  >
                    Nested action
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
      <Tooltip openDelay={150} closeDelay={0} disabled={disabled()}>
        <Tooltip.Trigger as={Button}>Help</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content>Help for this control</Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip>
      <Tooltip openDelay={500} closeDelay={0}>
        <Tooltip.Trigger>Delayed help</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content>Delayed content</Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip>
      <Tooltip triggerOnFocusOnly>
        <Tooltip.Trigger>Keyboard help</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content>Keyboard content</Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip>
      <Dialog open={dialog()} onOpenChange={setDialog}>
        <Dialog.Trigger>Open parent</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>Parent details</Dialog.Title>
            <Popover>
              <Popover.Trigger>Nested popover</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content>
                  <Popover.Title>Child options</Popover.Title>
                  <Input aria-label="Child value" />
                  <Popover.CloseButton>Close child options</Popover.CloseButton>
                </Popover.Content>
              </Popover.Portal>
            </Popover>
            <DropdownMenu>
              <DropdownMenu.Trigger>Nested menu</DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content>
                  <DropdownMenu.Item
                    onSelect={() => {
                      actions++
                    }}
                  >
                    Child action
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
            <Dialog.CloseButton>Close parent</Dialog.CloseButton>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </main>
  )
}
declare global {
  interface Window {
    overlayFixture: {
      configure: (next: {
        popover?: boolean
        menu?: boolean
        modal?: boolean
        accept?: boolean
        forceMount?: boolean
        prevent?: boolean
        disabled?: boolean
      }) => void
      read: () => {
        popover: boolean
        menu: boolean
        dialog: boolean
        checked: boolean
        radio: string
        actions: number
        requests: number
        cleanups: number
        refs: number
      }
      stop?: () => void
    }
  }
}
