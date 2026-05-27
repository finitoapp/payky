import { type Evolu as BaseEvolu, createQueryBuilder } from "@evolu/common"
import type { IndexesConfig } from "@evolu/common/local-first"

import {
  account,
  accountCashRegister,
  accountIban,
  accountIndexes,
  accountSpark,
} from "@/core/modules/account/account.ts"
import {
  accountTransaction,
  accountTransactionIban,
  accountTransactionIndexes,
  accountTransactionSpark,
} from "@/core/modules/account-transaction/account-transaction.ts"
import { appSettings } from "@/core/modules/app-settings/app-settings.ts"
import { bill, billIndexes } from "@/core/modules/bill/bill.ts"
import {
  billItem,
  billItemIndexes,
} from "@/core/modules/bill-item/bill-item.ts"
import {
  billItemLine,
  billItemLineIndexes,
} from "@/core/modules/bill-item-line/bill-item-line.ts"
import { catalogItem } from "@/core/modules/catalog-item/catalog-item.ts"
import { device, deviceIndexes } from "@/core/modules/device/device.ts"
import { item, itemIndexes } from "@/core/modules/item/item.ts"
import {
  payment,
  paymentCashRegister,
  paymentIban,
  paymentIndexes,
  paymentSpark,
} from "@/core/modules/payment/payment.ts"
import {
  paymentItemLine,
  paymentItemLineIndexes,
} from "@/core/modules/payment-item-line/payment-item-line.ts"
import { paymentLastNumber } from "@/core/modules/payment-last-number/payment-last-number.ts"
import { paymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series.ts"
import { table } from "@/core/modules/table/table.ts"

export const AppSchema = {
  device,
  account,
  accountIban,
  accountSpark,
  accountCashRegister,
  accountTransaction,
  accountTransactionIban,
  accountTransactionSpark,
  catalogItem,
  item,
  table,
  bill,
  billItemLine,
  billItem,
  payment,
  paymentCashRegister,
  paymentSpark,
  paymentIban,
  paymentItemLine,
  appSettings,
  paymentNumberSeries,
  paymentLastNumber,
} as const

export const createQuery = createQueryBuilder(AppSchema)

export const createAppIndexes: IndexesConfig = (create) => [
  ...accountIndexes(create),
  ...accountTransactionIndexes(create),
  ...itemIndexes(create),
  ...billIndexes(create),
  ...billItemIndexes(create),
  ...billItemLineIndexes(create),
  ...paymentIndexes(create),
  ...paymentItemLineIndexes(create),
  ...deviceIndexes(create),
]

export type EvoluSchema = typeof AppSchema
export type Evolu = BaseEvolu<EvoluSchema>
