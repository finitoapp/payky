import { type Evolu as BaseEvolu, createQueryBuilder } from "@evolu/common"
import type { IndexesConfig } from "@evolu/common/local-first"

import {
  account,
  accountCashRegister,
  accountIban,
  accountSpark,
} from "@/core/modules/account/account.ts"
import {
  accountTransaction,
  accountTransactionIban,
  accountTransactionSpark,
} from "@/core/modules/account-transaction/account-transaction.ts"
import { appSettings } from "@/core/modules/app-settings/app-settings.ts"
import { bill } from "@/core/modules/bill/bill.ts"
import { billItem } from "@/core/modules/bill-item/bill-item.ts"
import { billItemLine } from "@/core/modules/bill-item-line/bill-item-line.ts"
import { catalogItem } from "@/core/modules/catalog-item/catalog-item.ts"
import { device } from "@/core/modules/device/device.ts"
import { item } from "@/core/modules/item/item.ts"
import {
  payment,
  paymentCashRegister,
  paymentIban,
  paymentSpark,
} from "@/core/modules/payment/payment.ts"
import { paymentItemLine } from "@/core/modules/payment-item-line/payment-item-line.ts"
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
  create("account_kind").on("account").column("kind"),
  create("accountTransaction_accountId")
    .on("accountTransaction")
    .column("accountId"),
  create("accountTransaction_accountId_occurredAt")
    .on("accountTransaction")
    .columns(["accountId", "occurredAt"]),
  create("accountTransaction_internalTransferGroupId")
    .on("accountTransaction")
    .column("internalTransferGroupId"),
  create("accountTransactionSpark_sparkTransferId")
    .on("accountTransactionSpark")
    .column("sparkTransferId"),
  create("item_catalogItemId").on("item").column("catalogItemId"),
  create("bill_status").on("bill").column("status"),
  create("bill_tableId_status").on("bill").columns(["tableId", "status"]),
  create("billItem_billId").on("billItem").column("billId"),
  create("billItem_itemId").on("billItem").column("itemId"),
  create("billItemLine_billId_createdAt")
    .on("billItemLine")
    .columns(["billId", "createdAt"]),
  create("billItemLine_itemId").on("billItemLine").column("itemId"),
  create("payment_billId").on("payment").column("billId"),
  create("payment_tableId").on("payment").column("tableId"),
  create("payment_status").on("payment").column("status"),
  create("payment_createdAt").on("payment").column("createdAt"),
  create("payment_accountTransactionId")
    .on("payment")
    .column("accountTransactionId"),
  create("paymentCashRegister_accountId")
    .on("paymentCashRegister")
    .column("accountId"),
  create("paymentSpark_accountId").on("paymentSpark").column("accountId"),
  create("paymentSpark_sparkInvoice").on("paymentSpark").column("sparkInvoice"),
  create("paymentIban_accountId").on("paymentIban").column("accountId"),
  create("paymentIban_variableSymbol")
    .on("paymentIban")
    .column("variableSymbol"),
  create("paymentItemLine_paymentId").on("paymentItemLine").column("paymentId"),
  create("device_name").on("device").column("name"),
]

export type EvoluSchema = typeof AppSchema
export type Evolu = BaseEvolu<EvoluSchema>
