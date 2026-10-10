import { atom } from "jotai"

import type { DeviceAccountId } from "@/core/evolu/device-client.ts"

export interface RestoredAccount {
  /** Whether the phrase's account was new to this device, not just selected. */
  readonly created: boolean
  /** The account that was active before the restore. */
  readonly previous: DeviceAccountId
}

/**
 * What the restore that just ran in this app session did, for
 * `/restore-account` to clean up after. Memory only, never the URL: whatever
 * the URL carries anyone can type, and these two decide which account the
 * page removes from the device or selects (account/0005). A typed URL or a
 * reload finds it empty, and the page then removes and selects nothing.
 */
export const restoredAccountAtom = atom<RestoredAccount | null>(null)

export interface RestoreCleanup {
  /** Removed once the restored account's settings arrive, or on "set up as new". */
  readonly discardOnSuccess: DeviceAccountId | undefined
  /** Removed on "use another phrase": the restored account, when it was new. */
  readonly removeOnCancel: DeviceAccountId | undefined
  /** Selected again on "use another phrase". */
  readonly selectOnCancel: DeviceAccountId | undefined
}

export function planRestoreCleanup({
  restored,
  activeAccountId,
  source,
}: {
  readonly restored: RestoredAccount | null
  readonly activeAccountId: DeviceAccountId
  readonly source: "onboarding" | "settings"
}): RestoreCleanup {
  if (restored === null) {
    return {
      discardOnSuccess: undefined,
      removeOnCancel: undefined,
      selectOnCancel: undefined,
    }
  }

  const previous =
    restored.previous === activeAccountId ? undefined : restored.previous

  return {
    // The account active in onboarding is never onboarded itself — usually
    // the random one the first start created — so once the merchant has moved
    // on to the restored phrase it is an empty leftover. From Settings the
    // previous account is a real one and stays.
    discardOnSuccess: source === "onboarding" ? previous : undefined,
    removeOnCancel: restored.created ? activeAccountId : undefined,
    selectOnCancel: previous,
  }
}
