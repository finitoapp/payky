import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { ItemId } from "@/core/modules/item/item-types.ts"
import type {
  FiatCurrency,
  ItemLineType,
  NonEmptyString,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"

export interface BillLineSummary {
  readonly id: string
  readonly billId: BillId
  readonly catalogItemId: CatalogItemId | null
  readonly itemId: ItemId
  readonly type: ItemLineType
  readonly name: NonEmptyString
  readonly description: NonEmptyString | null
  readonly currency: FiatCurrency
  readonly quantity: PositiveNumber
  readonly totalAmount: NonNegativeInteger
}
