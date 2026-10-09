import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  completeOnboarding,
  setEnabledHomeModes,
  updateTipSettings,
} from "./app-settings-actions.ts"
import { settingsQuery } from "./app-settings-queries.ts"
import {
  defaultPaymentMethod,
  defaultPaymentMethodOrder,
} from "./app-settings-utils.ts"

const createDeps = (evolu: EvoluDep["evolu"]) =>
  ({
    evolu,
    evoluOwnerId: evolu.appOwner.id,
  }) satisfies EvoluDep & EvoluOwnerIdDep

describe("tip settings actions", () => {
  test("persists each tip setting through Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    await run.orThrow(
      completeOnboarding({
        fiatCurrency: "CZK",
        defaultPaymentMethod,
        paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
      })
    )
    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([
        expect.objectContaining({
          tipsEnabled: 1,
        }),
      ])
    await run.ok(
      updateTipSettings({
        enabled: false,
        percentages: [10, 20],
        fixedAmounts: [2500, 5000],
      })
    )

    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([
        expect.objectContaining({
          tipsEnabled: 0,
          presetTipPercentagesJson: "[10,20]",
          presetTipFixedAmountsJson: "[2500,5000]",
        }),
      ])
  })
})

describe("setEnabledHomeModes", () => {
  const onboard = completeOnboarding({
    fiatCurrency: "CZK",
    defaultPaymentMethod,
    paymentMethodOrderJson: JSON.stringify(defaultPaymentMethodOrder),
  })

  test("onboarding leaves the home modes unset, which means all of them", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    await run.orThrow(onboard)

    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([expect.objectContaining({ enabledHomeModesJson: null })])
  })

  test("saves the enabled modes in their fixed order", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    await run.orThrow(onboard)
    await run.orThrow(setEnabledHomeModes(["pos", "numpad", "pos"]))

    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([
        expect.objectContaining({ enabledHomeModesJson: '["numpad","pos"]' }),
      ])
  })

  test("refuses to disable every mode and keeps the stored set", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun(createDeps(evolu))

    await run.orThrow(onboard)
    await run.orThrow(setEnabledHomeModes(["pos"]))
    const result = await run(setEnabledHomeModes([]))

    expect(result).toEqual({
      ok: false,
      error: { type: "NoHomeModeEnabled" },
    })
    await expect
      .poll(() => evolu.loadQuery(settingsQuery))
      .toEqual([expect.objectContaining({ enabledHomeModesJson: '["pos"]' })])
  })
})
