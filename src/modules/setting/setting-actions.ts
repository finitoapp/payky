import type { UpdateValues } from "@evolu/common"
import type {
  AppSettingsRow,
  appSettings,
} from "@/modules/app-settings/app-settings.ts"
import type { AppSettingsId } from "@/modules/app-settings/app-settings-types.ts"
import type { EvoluDep } from "@/modules/shared/evolu-deps.ts"
import { removeUndefinedValues } from "@/modules/shared/utils.ts"
import { settingsQuery } from "./setting-queries.ts"
import { createDefaultSettings, settingsId } from "./setting-utils.ts"

type UpdateSettingsInput = Omit<UpdateValues<typeof appSettings>, "id">

export const getSettings =
  (deps: EvoluDep) => async (): Promise<AppSettingsRow> => {
    const existing = (await deps.evolu.loadQuery(settingsQuery))[0]
    if (existing != null) return existing

    const defaults = createDefaultSettings()
    deps.evolu.upsert("appSettings", defaults)
    return defaults
  }

export const updateSettings =
  (deps: EvoluDep) =>
  async (input: UpdateSettingsInput): Promise<AppSettingsId> => {
    deps.evolu.update(
      "appSettings",
      removeUndefinedValues({
        id: settingsId,
        ...input,
      })
    )
    return settingsId
  }
