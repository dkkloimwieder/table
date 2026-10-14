import { AlertDialog, Button, Dialog, Input, Sheet, uiScope } from '@table/ui'
import { Show, createSignal, flush, onCleanup } from 'solid-js'

export function DialogControls() {
  const parameters = new URLSearchParams(location.search)
  const uncontrolled = parameters.has('defaultDialog')
  const triggerless = parameters.has('triggerless')
  const [host, setHost] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  })
  const [open, setOpen] = createSignal(uncontrolled)
  const [child, setChild] = createSignal(false)
  const [alert, setAlert] = createSignal(false)
  const [sheet, setSheet] = createSignal(false)
  const [accept, setAccept] = createSignal(true)
  const [modal, setModal] = createSignal(true)
  const [preventEscape, setPreventEscape] = createSignal(false)
  const [preventOutside, setPreventOutside] = createSignal(false)
  const [preventInitialFocus, setPreventInitialFocus] = createSignal(false)
  const [preventClose, setPreventClose] = createSignal(false)
  const [redirect, setRedirect] = createSignal(false)
  const [long, setLong] = createSignal(false)
  const [forceMount, setForceMount] = createSignal(false)
  const [side, setSide] = createSignal<'left' | 'right' | 'top' | 'bottom'>(
    'right',
  )
  let requests = 0
  let confirmed = 0
  let cleanups = 0
  let refs = 0
  onCleanup(() => {
    cleanups++
  })
  window.dialogFixture = {
    configure(next) {
      if ('open' in next) setOpen(next.open!)
      if ('child' in next) setChild(next.child!)
      if ('alert' in next) setAlert(next.alert!)
      if ('sheet' in next) setSheet(next.sheet!)
      if ('accept' in next) setAccept(next.accept!)
      if ('modal' in next) setModal(next.modal!)
      if ('preventEscape' in next) setPreventEscape(next.preventEscape!)
      if ('preventOutside' in next) setPreventOutside(next.preventOutside!)
      if ('preventInitialFocus' in next)
        setPreventInitialFocus(next.preventInitialFocus!)
      if ('preventClose' in next) setPreventClose(next.preventClose!)
      if ('redirect' in next) setRedirect(next.redirect!)
      if ('long' in next) setLong(next.long!)
      if ('forceMount' in next) setForceMount(next.forceMount!)
      if ('side' in next) setSide(next.side!)
      flush()
    },
    read: () => ({
      open: open(),
      child: child(),
      alert: alert(),
      sheet: sheet(),
      requests,
      confirmed,
      cleanups,
      refs,
    }),
  }
  return (
    <main
      {...uiScope()}
      ref={setHost}
      data-ui-portal-root=""
      data-ui-theme={parameters.has('dark') ? 'dark' : undefined}
      style={{ 'min-height': '180vh' }}
    >
      <h1>Dialog controls</h1>
      <Button
        id="outside-button"
        onClick={() => {
          if (triggerless) setOpen(true)
        }}
      >
        Outside action
      </Button>
      <div id="reserved" style={{ height: '200px', border: '1px solid' }}>
        Reserved page area
      </div>
      <Dialog
        id="main-dialog"
        open={uncontrolled ? undefined : open()}
        defaultOpen={uncontrolled}
        modal={modal()}
        forceMount={forceMount()}
        onOpenChange={(value) => {
          requests++
          if (accept()) setOpen(value)
        }}
      >
        <Show when={!triggerless}>
          <Dialog.Trigger
            as={Button}
            ref={() => {
              refs++
            }}
          >
            Open dialog
          </Dialog.Trigger>
        </Show>
        <Dialog.Portal mount={triggerless ? host() : undefined}>
          <Show when={modal()}>
            <Dialog.Overlay data-overlay="main" />
          </Show>
          <Dialog.Content
            as="section"
            data-content="main"
            ref={() => {
              refs++
            }}
            onOpenAutoFocus={(event) => {
              if (preventInitialFocus()) event.preventDefault()
            }}
            onEscapeKeyDown={(event) => {
              if (preventEscape()) event.preventDefault()
            }}
            onPointerDownOutside={(event) => {
              if (preventOutside()) event.preventDefault()
            }}
            onCloseAutoFocus={(event) => {
              if (redirect()) {
                event.preventDefault()
                document
                  .querySelector<HTMLButtonElement>('#outside-button')
                  ?.focus()
              }
            }}
          >
            <Dialog.Title>Edit details</Dialog.Title>
            <Dialog.Description>
              The application owns these values.
            </Dialog.Description>
            <Input aria-label="Dialog name" defaultValue="Example" />
            <Dialog.CloseButton
              aria-label="Done"
              onClick={(event) => {
                if (preventClose()) event.preventDefault()
              }}
            >
              Done
            </Dialog.CloseButton>
            <Dialog id="child-dialog" open={child()} onOpenChange={setChild}>
              <Dialog.Trigger>Open child</Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay data-overlay="child" />
                <Dialog.Content data-content="child">
                  <Dialog.Title>Child details</Dialog.Title>
                  <Dialog.Description>A nested dialog.</Dialog.Description>
                  <Input aria-label="Child name" />
                  <Dialog.CloseButton aria-label="Close child">
                    Close child
                  </Dialog.CloseButton>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog>
            <Show when={long()}>
              <div style={{ height: '1200px' }}>Long content</div>
            </Show>
            <Dialog.CloseButton aria-label="Close details">
              Close details
            </Dialog.CloseButton>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
      <AlertDialog id="alert-dialog" open={alert()} onOpenChange={setAlert}>
        <AlertDialog.Trigger>Open confirmation</AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay data-overlay="alert" />
          <AlertDialog.Content>
            <AlertDialog.Title>Apply changes?</AlertDialog.Title>
            <AlertDialog.Description>
              The application owns the confirmed operation.
            </AlertDialog.Description>
            <AlertDialog.Action
              onClick={() => {
                confirmed++
              }}
            >
              Apply
            </AlertDialog.Action>
            <AlertDialog.Cancel>Keep current</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog>
      <Sheet id="sheet-dialog" open={sheet()} onOpenChange={setSheet}>
        <Sheet.Trigger>Open sheet</Sheet.Trigger>
        <Sheet.Portal>
          <Sheet.Overlay data-overlay="sheet" />
          <Sheet.Content side={side()}>
            <Sheet.Title>Display details</Sheet.Title>
            <Sheet.Description>Sheet uses Dialog behavior.</Sheet.Description>
            <Input aria-label="Sheet name" />
            <Sheet.CloseButton aria-label="Close sheet">
              Close sheet
            </Sheet.CloseButton>
          </Sheet.Content>
        </Sheet.Portal>
      </Sheet>
    </main>
  )
}
declare global {
  interface Window {
    dialogFixture: {
      configure: (next: {
        open?: boolean
        child?: boolean
        alert?: boolean
        sheet?: boolean
        accept?: boolean
        modal?: boolean
        preventEscape?: boolean
        preventOutside?: boolean
        preventInitialFocus?: boolean
        preventClose?: boolean
        redirect?: boolean
        long?: boolean
        forceMount?: boolean
        side?: 'left' | 'right' | 'top' | 'bottom'
      }) => void
      read: () => {
        open: boolean
        child: boolean
        alert: boolean
        sheet: boolean
        requests: number
        confirmed: number
        cleanups: number
        refs: number
      }
      stop?: () => void
    }
  }
}
