import { describe, expect, test } from "vitest"

import type { DeviceAccountId } from "@/core/evolu/device-client.ts"
import { planRestoreCleanup } from "@/features/account/restored-account.ts"

const active = "active-account" as DeviceAccountId
const previous = "previous-account" as DeviceAccountId

describe("planRestoreCleanup", () => {
  test.each(["onboarding", "settings"] as const)(
    "an empty atom removes and selects no account from %s",
    (source) => {
      expect(
        planRestoreCleanup({ restored: null, activeAccountId: active, source })
      ).toEqual({
        discardOnSuccess: undefined,
        removeOnCancel: undefined,
        selectOnCancel: undefined,
      })
    }
  )

  test("a restore from onboarding discards the leftover account and cancels back to it", () => {
    expect(
      planRestoreCleanup({
        restored: { created: true, previous },
        activeAccountId: active,
        source: "onboarding",
      })
    ).toEqual({
      discardOnSuccess: previous,
      removeOnCancel: active,
      selectOnCancel: previous,
    })
  })

  test("a restore from settings keeps the previous account", () => {
    expect(
      planRestoreCleanup({
        restored: { created: false, previous },
        activeAccountId: active,
        source: "settings",
      })
    ).toEqual({
      discardOnSuccess: undefined,
      removeOnCancel: undefined,
      selectOnCancel: previous,
    })
  })
})
