import {
  err,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import type { appSettings } from "@/core/modules/app-settings/app-settings.ts"
import type {
  AppSettingsId,
  DefaultPaymentMethod,
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
import { createDefaultSettings, settingsId } from "./app-settings-utils.ts"

const defaultPaymentMethodDisabledError = defineError(
  "DefaultPaymentMethodDisabled"
)<{ readonly method: DefaultPaymentMethod }>()
export type DefaultPaymentMethodDisabledError = ReturnType<
  typeof defaultPaymentMethodDisabledError
>

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
  }): Task<AppSettingsId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

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

export const setDefaultPaymentMethod =
  (
    method: DefaultPaymentMethod
  ): Task<
    AppSettingsId,
    DefaultPaymentMethodDisabledError,
    EvoluDep & EvoluOwnerIdDep
  > =>
  async (run) => {
    const [
      settingsRows,
      fiatBankAccountRows,
      sparkAccountRows,
      cashRegisterAccountRows,
    ] = await Promise.all([
      run.deps.evolu.loadQuery(settingsQuery),
      run.deps.evolu.loadQuery(fiatBankAccountQuery),
      run.deps.evolu.loadQuery(sparkAccountQuery),
      run.deps.evolu.loadQuery(cashRegisterAccountQuery),
    ])
    const [settings] = settingsRows
    const [fiatBankAccount] = fiatBankAccountRows
    const [sparkAccount] = sparkAccountRows
    const [cashRegisterAccount] = cashRegisterAccountRows
    const fiatCurrency = settings?.fiatCurrency
    const methodIsEnabled = {
      iban:
        fiatBankAccount !== undefined &&
        fiatBankAccount.isDeleted !== 1 &&
        fiatBankAccount.currency === fiatCurrency,
      spark: sparkAccount !== undefined && sparkAccount.isDeleted !== 1,
      cashRegister:
        cashRegisterAccount !== undefined &&
        cashRegisterAccount.isDeleted !== 1 &&
        cashRegisterAccount.currency === fiatCurrency,
    } satisfies Record<DefaultPaymentMethod, boolean>

    if (!methodIsEnabled[method]) {
      return err(defaultPaymentMethodDisabledError({ method }))
    }

    return await run(updateSettings({ defaultPaymentMethod: method }))
  }
