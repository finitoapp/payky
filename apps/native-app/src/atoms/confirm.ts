import { atom } from "jotai"

/** Mirrors the web request, with texts already translated. */
export interface ConfirmRequest {
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly variant?: "default" | "destructive"
  readonly resolve: (confirmed: boolean) => void
}

/** FIFO queue of pending confirmations; only the helpers below touch it. */
export const confirmQueueAtom = atom<ReadonlyArray<ConfirmRequest>>([])

export const enqueueConfirmAtom = atom(
  null,
  (_get, set, options: Omit<ConfirmRequest, "resolve">) =>
    new Promise<boolean>((resolve) => {
      set(confirmQueueAtom, (queue) => [...queue, { ...options, resolve }])
    })
)

/** Settles and removes the head request. */
export const settleConfirmAtom = atom(null, (get, set, confirmed: boolean) => {
  const [head, ...rest] = get(confirmQueueAtom)
  if (head === undefined) return
  set(confirmQueueAtom, rest)
  head.resolve(confirmed)
})

/** Settles every pending request with `false` (unmount, account switch). */
export const clearConfirmsAtom = atom(null, (get, set) => {
  const queue = get(confirmQueueAtom)
  set(confirmQueueAtom, [])
  for (const request of queue) request.resolve(false)
})
