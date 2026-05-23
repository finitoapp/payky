import type { IndexesConfig } from "@evolu/common/local-first"

import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { ItemId } from "@/core/modules/item/item-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
} from "@/core/modules/shared/schema.ts"

export const item = {
  id: ItemId,
  catalogItemId: CatalogItemId.nullable(),
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  unitAmount: NonNegativeIntegerSchema,
} as const

export const itemIndexes = ((create) => [
  create("item_catalogItemId").on("item").column("catalogItemId"),
]) satisfies IndexesConfig

export type ItemRow = InferTable<typeof item>
