import { ok, type Task, type UpdateValues } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type {
  AppSettingsRow,
  appSettings,
} from "@/core/modules/app-settings/app-settings.ts"
import type { AppSettingsId } from "@/core/modules/app-settings/app-settings-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { settingsQuery } from "./app-settings-queries.ts"
import { createDefaultSettings, settingsId } from "./app-settings-utils.ts"

export const getSettings =
  (): Task<AppSettingsRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const existing = (await run.deps.evolu.loadQuery(settingsQuery))[0]
    if (existing !== undefined) return ok(existing)

    const defaults = createDefaultSettings()
    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert("appSettings", defaults, {
        ...options,
        ownerId: evoluOwnerId,
      })
    )
    return ok(defaults)
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
