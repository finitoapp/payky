import { createQuery } from "@/core/evolu/schema.ts"
import { legalEntityId } from "./legal-entity-utils.ts"

export const legalEntityQuery = createQuery((db) =>
  db.selectFrom("legalEntity").selectAll().where("id", "=", legalEntityId)
)
