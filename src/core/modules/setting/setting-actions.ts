import { ok, type Task, type UpdateValues } from "@evolu/common"
import type {
  AppSettingsRow,
  appSettings,
} from "@/core/modules/app-settings/app-settings.ts"
import type { AppSettingsId } from "@/core/modules/app-settings/app-settings-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { removeUndefinedValues } from "@/core/modules/shared/utils.ts"
import { settingsQuery } from "./setting-queries.ts"
import { createDefaultSettings, settingsId } from "./setting-utils.ts"

type UpdateSettingsInput = Omit<UpdateValues<typeof appSettings>, "id">

export const getSettings =
  (): Task<AppSettingsRow, never, EvoluDep> => async (run) => {
    const existing = (await run.deps.evolu.loadQuery(settingsQuery))[0]
    if (existing != null) return ok(existing)

    const defaults = createDefaultSettings()
    run.deps.evolu.upsert("appSettings", defaults)
    return ok(defaults)
  }

export const updateSettings =
  (input: UpdateSettingsInput): Task<AppSettingsId, never, EvoluDep> =>
  async (run) => {
    run.deps.evolu.update(
      "appSettings",
      removeUndefinedValues({
        id: settingsId,
        ...input,
      })
    )
    return ok(settingsId)
  }
