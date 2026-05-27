import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
} from "@/core/modules/shared/schema.ts"

export const catalogItem = {
  id: CatalogItemId,
  deviceId: DeviceId.nullable(),
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  unitAmount: NonNegativeIntegerSchema,
  sortOrder: NonNegativeIntegerSchema,
} as const

export type CatalogItem = typeof catalogItem
export type CatalogItemRow = InferTable<typeof catalogItem>
