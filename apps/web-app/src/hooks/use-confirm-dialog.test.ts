import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setQueue: vi.fn(),
  useAtomValue: vi.fn(),
}))

vi.mock("jotai", () => ({
  atom: (initial: unknown) => initial,
  useSetAtom: () => mocks.setQueue,
  useAtomValue: mocks.useAtomValue,
}))

vi.mock("react", () => ({
  useCallback: (fn: unknown) => fn,
}))

import type { ConfirmDialogRequest } from "@/atoms/confirm-dialog.ts"
import {
  useConfirmDialog,
  useIsConfirmDialogOpen,
} from "./use-confirm-dialog.ts"

type QueueUpdater = (
  queue: ReadonlyArray<ConfirmDialogRequest>
) => ReadonlyArray<ConfirmDialogRequest>

const OPTIONS = {
  title: "Delete?",
  description: "This can't be undone.",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
} as const

describe("useConfirmDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("enqueues a request and resolves true once it settles", async () => {
    const confirm = useConfirmDialog()
    const promise = confirm(OPTIONS)

    expect(mocks.setQueue).toHaveBeenCalledTimes(1)
    const updater = mocks.setQueue.mock.calls[0]?.[0] as QueueUpdater
    const queue = updater([])
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject(OPTIONS)

    queue[0]?.resolve(true)
    await expect(promise).resolves.toBe(true)
  })

  test("resolves false when the request settles as cancelled", async () => {
    const confirm = useConfirmDialog()
    const promise = confirm(OPTIONS)

    const updater = mocks.setQueue.mock.calls[0]?.[0] as QueueUpdater
    const queue = updater([])
    queue[0]?.resolve(false)

    await expect(promise).resolves.toBe(false)
  })

  test("a second overlapping call queues instead of dropping the first", async () => {
    const confirm = useConfirmDialog()
    const firstPromise = confirm(OPTIONS)
    const secondPromise = confirm({ ...OPTIONS, title: "Archive?" })

    const firstUpdater = mocks.setQueue.mock.calls[0]?.[0] as QueueUpdater
    const secondUpdater = mocks.setQueue.mock.calls[1]?.[0] as QueueUpdater

    // Both calls chain on the same queue state, exactly as React applies
    // functional updaters queued within one batch.
    const afterFirst = firstUpdater([])
    const afterSecond = secondUpdater(afterFirst)

    expect(afterSecond).toHaveLength(2)

    afterSecond[0]?.resolve(true)
    afterSecond[1]?.resolve(false)

    await expect(firstPromise).resolves.toBe(true)
    await expect(secondPromise).resolves.toBe(false)
  })
})

describe("useIsConfirmDialogOpen", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("is false for an empty queue and true once something is queued", () => {
    mocks.useAtomValue.mockReturnValue([])
    expect(useIsConfirmDialogOpen()).toBe(false)

    mocks.useAtomValue.mockReturnValue([{ title: "x" }])
    expect(useIsConfirmDialogOpen()).toBe(true)
  })
})
