import { CatalogItemId } from "@/modules/catalog-item/catalog-item-types.ts"
import { ItemId } from "@/modules/item/item-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
} from "@/modules/shared/schema.ts"

export const item = {
  id: ItemId,
  catalogItemId: CatalogItemId.nullable(),
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  unitAmount: NonNegativeIntegerSchema,
} as const

export type ItemRow = InferTable<typeof item>
