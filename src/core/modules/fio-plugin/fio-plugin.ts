import { SqliteBoolean } from "@evolu/common"
import type { IndexesConfig } from "@evolu/common/local-first"

import { AccountId } from "@/core/modules/account/account-types.ts"
import {
  FioPluginId,
  FioPluginTokenId,
} from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import {
  HttpsUrlSchema,
  type InferTable,
  NonEmptyString255Schema,
  PositiveIntegerSchema,
} from "@/core/modules/shared/schema.ts"

export const fioPlugin = {
  id: FioPluginId,
  accountId: AccountId,
  apiUrl: HttpsUrlSchema,
  numberOfSecondsBetweenChecks: PositiveIntegerSchema,
  isActive: SqliteBoolean,
} as const

export const fioPluginToken = {
  id: FioPluginTokenId,
  fioPluginId: FioPluginId,
  token: NonEmptyString255Schema,
} as const

export const fioPluginIndexes = ((create) => [
  create("fioPlugin_accountId").on("fioPlugin").column("accountId"),
  create("fioPluginToken_fioPluginId")
    .on("fioPluginToken")
    .column("fioPluginId"),
]) satisfies IndexesConfig

export type FioPluginRow = InferTable<typeof fioPlugin>
export type FioPluginTokenRow = InferTable<typeof fioPluginToken>
