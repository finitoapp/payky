import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { BillLineSummaryId } from "@/core/modules/bill-line/bill-line-types.ts"
import type { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { ItemId } from "@/core/modules/item/item-types.ts"
import type {
  FiatCurrency,
  ItemLineType,
  NonEmptyString,
  NonNegativeInteger,
  PositiveNumber,
} from "@/core/modules/shared/schema.ts"
import type { TaxRateId } from "@/core/modules/tax-rate/tax-rate-types.ts"

export interface BillLineSummary {
  readonly id: BillLineSummaryId
  readonly billId: BillId
  readonly catalogItemId: CatalogItemId | null
  readonly itemId: ItemId
  readonly type: ItemLineType
  readonly name: NonEmptyString
  readonly description: NonEmptyString | null
  readonly currency: FiatCurrency
  readonly quantity: PositiveNumber
  readonly totalAmount: NonNegativeInteger
  /** Frozen at the moment the underlying `item` snapshot was created. */
  readonly taxRateId: TaxRateId | null
}
