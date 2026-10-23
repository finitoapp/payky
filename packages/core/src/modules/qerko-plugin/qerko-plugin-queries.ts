import { type KyselyNotNull, sqliteTrue } from "@evolu/common"

import { createQuery } from "../../evolu/schema.ts"
import { qerkoPluginId } from "./qerko-plugin-utils.ts"

/** The pairing, absent while the terminal is not paired. */
export const qerkoPluginQuery = createQuery((db) =>
  db
    .selectFrom("qerkoPlugin")
    .selectAll()
    .where("id", "=", qerkoPluginId)
    .where("environment", "is not", null)
    .where("apiKey", "is not", null)
    .where("apiKeyName", "is not", null)
    .where("legalEntityName", "is not", null)
    .where("identificationNumber", "is not", null)
    .where("country", "is not", null)
    .where("isDeleted", "is not", sqliteTrue)
    .$narrowType<{
      environment: KyselyNotNull
      apiKey: KyselyNotNull
      apiKeyName: KyselyNotNull
      legalEntityName: KyselyNotNull
      identificationNumber: KyselyNotNull
      country: KyselyNotNull
    }>()
)
