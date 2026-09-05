import { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  FiatCurrencySchema,
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
} from "@/core/modules/shared/schema.ts"
import { TaxRateId } from "@/core/modules/tax-rate/tax-rate-types.ts"

export const catalogItem = {
  id: CatalogItemId,
  deviceId: DeviceId.nullable(),
  categoryId: CatalogCategoryId.nullable(),
  name: NonEmptyString255Schema,
  description: NonEmptyString255Schema.nullable(),
  internalName: NonEmptyString255Schema.nullable(),
  internalDescription: NonEmptyString255Schema.nullable(),
  sku: NonEmptyString255Schema.nullable(),
  currency: FiatCurrencySchema,
  unitAmount: NonNegativeIntegerSchema,
  sortOrder: NonNegativeIntegerSchema,
  scanCode: NonEmptyString255Schema.nullable(),
  /** `null` supports non-VAT-payer tenants and items with no tax assigned yet. */
  taxRateId: TaxRateId.nullable(),
} as const

export type CatalogItem = typeof catalogItem
export type CatalogItemRow = InferTable<typeof catalogItem>
