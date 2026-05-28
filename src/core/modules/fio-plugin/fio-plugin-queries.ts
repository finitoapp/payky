import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"

export const fioPluginByIdQuery = (idValue: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPlugin")
      .selectAll()
      .where("id", "=", idValue)
      .where("accountId", "is not", null)
      .where("apiUrl", "is not", null)
      .where("numberOfSecondsBetweenChecks", "is not", null)
      .where("isActive", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        accountId: KyselyNotNull
        apiUrl: KyselyNotNull
        numberOfSecondsBetweenChecks: KyselyNotNull
        isActive: KyselyNotNull
      }>()
  )

export const fioPluginTokensByPluginIdQuery = (fioPluginId: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPluginToken")
      .selectAll()
      .where("fioPluginId", "=", fioPluginId)
      .where("token", "is not", null)
      .where("isDeleted", "is", null)
      .$narrowType<{
        fioPluginId: KyselyNotNull
        token: KyselyNotNull
      }>()
  )
