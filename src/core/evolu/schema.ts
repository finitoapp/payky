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
  accountTransactionLightning,
  accountTransactionOnchain,
  accountTransactionSource,
  accountTransactionSpark,
  accountTransactionSparkInvoice,
} from "@/core/modules/account-transaction/account-transaction.ts"
import { appSettings } from "@/core/modules/app-settings/app-settings.ts"
import { bill, billIndexes } from "@/core/modules/bill/bill.ts"
import {
  billLine,
  billLineIndexes,
} from "@/core/modules/bill-line/bill-line.ts"
import { catalogItem } from "@/core/modules/catalog-item/catalog-item.ts"
import { device, deviceIndexes } from "@/core/modules/device/device.ts"
import {
  fioPlugin,
  fioPluginIndexes,
  fioPluginSyncPointer,
  fioPluginToken,
} from "@/core/modules/fio-plugin/fio-plugin.ts"
import { item, itemIndexes } from "@/core/modules/item/item.ts"
import {
  payment,
  paymentBtc,
  paymentBtcLightning,
  paymentBtcSpark,
  paymentCashRegister,
  paymentIban,
  paymentIndexes,
} from "@/core/modules/payment/payment.ts"
import {
  paymentLine,
  paymentLineIndexes,
} from "@/core/modules/payment-line/payment-line.ts"
import {
  paymentLastNumber,
  paymentNumber,
} from "@/core/modules/payment-number/payment-number.ts"
import { paymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series.ts"
import {
  reconciliationClaim,
  reconciliationClaimIndexes,
} from "@/core/modules/reconciliation-claim/reconciliation-claim.ts"
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
  accountTransactionSparkInvoice,
  accountTransactionLightning,
  accountTransactionOnchain,
  accountTransactionSource,
  catalogItem,
  item,
  table,
  bill,
  billLine,
  payment,
  paymentCashRegister,
  paymentBtc,
  paymentBtcLightning,
  paymentBtcSpark,
  paymentIban,
  paymentLine,
  paymentNumber,
  paymentLastNumber,
  reconciliationClaim,
  appSettings,
  paymentNumberSeries,
  fioPlugin,
  fioPluginSyncPointer,
  fioPluginToken,
} as const

export const createQuery = createQueryBuilder(AppSchema)

export const createAppIndexes: IndexesConfig = (create) => [
  ...accountIndexes(create),
  ...accountTransactionIndexes(create),
  ...itemIndexes(create),
  ...billIndexes(create),
  ...billLineIndexes(create),
  ...paymentIndexes(create),
  ...paymentLineIndexes(create),
  ...reconciliationClaimIndexes(create),
  ...deviceIndexes(create),
  ...fioPluginIndexes(create),
]

export type EvoluSchema = typeof AppSchema
export type Evolu = BaseEvolu<EvoluSchema>
