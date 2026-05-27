import type { KyselyNotNull } from "@evolu/common"

import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "./account-types.ts"

export const accountByIdQuery = (idValue: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .selectAll()
      .where("id", "=", idValue)
      .where("name", "is not", null)
      .where("kind", "is not", null)
      .$narrowType<{
        name: KyselyNotNull
        kind: KyselyNotNull
      }>()
  )
