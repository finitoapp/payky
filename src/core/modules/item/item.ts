import type { IndexesConfig } from "@evolu/common/local-first"

import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { ItemId } from "@/core/modules/item/item-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
} from "@/core/modules/shared/schema.ts"
import { TaxRateId } from "@/core/modules/tax-rate/tax-rate-types.ts"

export const item = {
  id: ItemId,
  catalogItemId: CatalogItemId.nullable(),
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  unitAmount: NonNegativeIntegerSchema,
  /**
   * Frozen at snapshot time — see `createItemIdFromSnapshot` in
   * `item-utils.ts`, which includes this field in the content hash so a
   * later change to the source `catalogItem.taxRateId` produces a new
   * `item` row instead of mutating this one in place.
   */
  taxRateId: TaxRateId.nullable(),
} as const

export const itemIndexes = ((create) => [
  create("item_catalogItemId").on("item").column("catalogItemId"),
]) satisfies IndexesConfig

export type ItemRow = InferTable<typeof item>
