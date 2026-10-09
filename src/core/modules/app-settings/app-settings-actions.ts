import {
  err,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"
import { z } from "zod"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { appSettings } from "@/core/modules/app-settings/app-settings.ts"
import type {
  AppSettingsId,
  DefaultPaymentMethod,
  TerminalHomeMode,
} from "@/core/modules/app-settings/app-settings-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { settingsQuery } from "./app-settings-queries.ts"
import {
  stringifyTipFixedAmounts,
  stringifyTipPercentages,
} from "./app-settings-tips.ts"
import {
  createDefaultSettings,
  EnabledHomeModesJson,
  PaymentMethodOrderJson,
  settingsId,
  terminalHomeModes,
} from "./app-settings-utils.ts"

const createAlreadyOnboardedError = defineError("AlreadyOnboarded")()
export type AlreadyOnboardedError = ReturnType<
  typeof createAlreadyOnboardedError
>

/**
 * Refuses an account that already has its appSettings row: onboarding writes
 * last-write-wins singletons (the bank account among them), so running it
 * again on an onboarded account would overwrite them (account/0005).
 */
export const requireNotOnboarded =
  (): Task<void, AlreadyOnboardedError, EvoluDep> => async (run) => {
    const rows = await run.deps.evolu.loadQuery(settingsQuery)
    return rows.length === 0 ? ok() : err(createAlreadyOnboardedError())
  }

/**
 * Creates the appSettings row when onboarding finishes. The row's existence
 * marks the account as onboarded; `onboardingCompleted` is still written for
 * compatibility with older app versions syncing the same account.
 */
export const completeOnboarding =
  (input: {
    readonly fiatCurrency: FiatCurrency
    readonly defaultPaymentMethod: DefaultPaymentMethod
    readonly paymentMethodOrderJson: string
  }): Task<AppSettingsId, AlreadyOnboardedError, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    // The last line of defence; `finishOnboarding` checks before its first
    // write already.
    const notOnboarded = await run(requireNotOnboarded())
    if (!notOnboarded.ok) return notOnboarded

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "appSettings",
        {
          ...createDefaultSettings(),
          ...input,
          onboardingCompleted: sqliteTrue,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(settingsId)
  }

export const updateSettings =
  (
    input: Omit<UpdateValues<typeof appSettings>, "id">
  ): Task<AppSettingsId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "appSettings",
        removeUndefinedValues({
          id: settingsId,
          ...input,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(settingsId)
  }

export const updateTipSettings =
  (input: {
    readonly enabled: boolean
    readonly fixedAmounts: ReadonlyArray<number>
    readonly percentages: ReadonlyArray<number>
  }): Task<AppSettingsId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) =>
    await run(
      updateSettings({
        tipsEnabled: input.enabled ? sqliteTrue : sqliteFalse,
        presetTipPercentagesJson: stringifyTipPercentages(input.percentages),
        presetTipFixedAmountsJson: stringifyTipFixedAmounts(input.fixedAmounts),
      })
    )

/**
 * Saves the order payment methods are offered in. The first one is also
 * written as `defaultPaymentMethod`, which `getPaymentMethodOrder` moves to
 * the front — so the two can no longer disagree, and older app versions
 * syncing the same account still open the right tab.
 */
export const setPaymentMethodOrder =
  (
    order: ReadonlyArray<DefaultPaymentMethod>
  ): Task<AppSettingsId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) =>
    await run(
      updateSettings({
        paymentMethodOrderJson: z.encode(PaymentMethodOrderJson, order),
        defaultPaymentMethod: order[0],
      })
    )

const createNoHomeModeEnabledError = defineError("NoHomeModeEnabled")()
export type NoHomeModeEnabledError = ReturnType<
  typeof createNoHomeModeEnabledError
>

/**
 * Saves which modes the home screen offers. The home screen must always have
 * one to show, so an empty set is refused rather than written. The whole set
 * is one column on purpose: two devices each switching off a different mode
 * resolve to one of their writes, never to both modes off.
 */
export const setEnabledHomeModes =
  (
    modes: ReadonlyArray<TerminalHomeMode>
  ): Task<AppSettingsId, NoHomeModeEnabledError, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const enabled = terminalHomeModes.filter((mode) => modes.includes(mode))
    if (enabled.length === 0) return err(createNoHomeModeEnabledError())

    return await run(
      updateSettings({
        enabledHomeModesJson: z.encode(EnabledHomeModesJson, enabled),
      })
    )
  }
