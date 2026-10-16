import { sqliteTrue } from "@evolu/common"

import { createQuery } from "../../evolu/schema.ts"
import { accessControlId } from "./access-types.ts"

/** The account's access-control row; none means access control is off. */
export const accessControlQuery = createQuery((db) =>
  db
    .selectFrom("accessControl")
    .select(["id", "enabled", "pin"])
    .where("id", "=", accessControlId)
    .where("isDeleted", "is not", sqliteTrue)
)
