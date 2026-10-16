import { DeviceId } from "../device/device-types.ts"
import {
  type InferTable,
  NonEmptyString255Schema,
  NonNegativeIntegerSchema,
} from "../shared/schema.ts"
import { CatalogCategoryId } from "./catalog-category-types.ts"

export const catalogCategory = {
  id: CatalogCategoryId,
  deviceId: DeviceId.nullable(),
  name: NonEmptyString255Schema,
  sortOrder: NonNegativeIntegerSchema,
} as const

export type CatalogCategory = typeof catalogCategory
export type CatalogCategoryRow = InferTable<typeof catalogCategory>
