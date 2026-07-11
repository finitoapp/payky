import { ok, sqliteTrue, type Task, type UpdateValues } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { appSettings } from "@/core/modules/app-settings/app-settings.ts"
import type {
  AppSettingsId,
  DefaultPaymentMethod,
} from "@/core/modules/app-settings/app-settings-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { createDefaultSettings, settingsId } from "./app-settings-utils.ts"

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
