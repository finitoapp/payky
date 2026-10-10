import { useAtom, useSetAtom } from "jotai"
import { Suspense } from "react"

import {
  accessSessionAtom,
  type PinPromptRequest,
  pinPromptQueueAtom,
} from "@/atoms/access.ts"
import { PinScreen, type UnlockedVia } from "@/components/app/pin-screen.tsx"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx"
import { useAccess } from "@/hooks/use-access.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Renders the one-shot PIN prompt driven by `pinPromptQueueAtom`
 * (access/0002): it answers the one action at the head of the queue and
 * starts no session — except the recovery phrase, which starts one
 * (access/0006). Cancelling answers `false`, and the action is not performed.
 */
export function PinPromptHost() {
  const [queue, setQueue] = useAtom(pinPromptQueueAtom)
  const current = queue[0] ?? null

  const settle = (request: PinPromptRequest, granted: boolean) => {
    request.resolve(granted)
    setQueue((remaining) =>
      remaining[0] === request ? remaining.slice(1) : remaining
    )
  }

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => {
        if (!open && current !== null) settle(current, false)
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-auto">
        {current === null ? null : (
          <Suspense fallback={null}>
            <PinPrompt
              key={current.id}
              request={current}
              onSettled={(granted) => settle(current, granted)}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PinPrompt({
  request,
  onSettled,
}: {
  readonly request: PinPromptRequest
  readonly onSettled: (granted: boolean) => void
}) {
  const { t } = useTranslation()
  const { accountId } = useAccess()
  const setSession = useSetAtom(accessSessionAtom)

  const unlocked = (via: UnlockedVia) => {
    if (via === "phrase") setSession({ accountId })
    onSettled(true)
  }

  return (
    <>
      <DialogTitle className="sr-only">{t(request.action)}</DialogTitle>
      {request.detail === undefined ? null : (
        <p
          className="text-center text-sm font-medium break-words"
          data-testid="pin-prompt-detail"
        >
          {request.detail}
        </p>
      )}
      <PinScreen
        permission={request.permission}
        action={request.action}
        target={request.action}
        onUnlocked={unlocked}
        onCancel={() => onSettled(false)}
      />
    </>
  )
}
