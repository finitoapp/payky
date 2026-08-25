import { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
} from "@/core/modules/shared/schema.ts"

export const catalogCategory = {
  id: CatalogCategoryId,
  deviceId: DeviceId.nullable(),
  name: NonEmptyString255Schema,
  sortOrder: NonNegativeIntegerSchema,
} as const

export type CatalogCategory = typeof catalogCategory
export type CatalogCategoryRow = InferTable<typeof catalogCategory>
