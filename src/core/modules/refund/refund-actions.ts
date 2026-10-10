import {
  createIdFromString,
  err,
  type InferRow,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"
import type { RequireExactlyOne } from "type-fest"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import { cashRegisterAccountByIdQuery } from "@/core/modules/account/account-queries.ts"
import { createCashRegisterAccountId } from "@/core/modules/account/account-utils.ts"
import {
  computeAccountTransactionRows,
  upsertAccountTransactionRows,
} from "@/core/modules/account-transaction/account-transaction-actions.ts"
import { deriveCashRefundAccountTransactionId } from "@/core/modules/account-transaction/account-transaction-utils.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import {
  type CashRegisterAccountNotFoundError,
  createCashRegisterAccountNotFoundError,
  createPaymentNotFoundError,
  type PaymentNotFoundError,
} from "@/core/modules/payment/payment-errors.ts"
import { loadPaymentStatus } from "@/core/modules/payment/payment-guards.ts"
import { paymentDetailQuery } from "@/core/modules/payment/payment-queries.ts"
import type {
  PaymentId,
  PaymentStatus,
} from "@/core/modules/payment/payment-types.ts"
import type { PaymentLineId } from "@/core/modules/payment-line/payment-line-types.ts"
import { activeClaimedTransactionsByPaymentIdQuery } from "@/core/modules/reconciliation-claim/reconciliation-claim-queries.ts"
import {
  otherClaimedPaymentOfBillQuery,
  refundablePaymentLinesQuery,
  refundLinesByPaymentIdQuery,
  refundsByPaymentIdQuery,
} from "@/core/modules/refund/refund-queries.ts"
import type {
  RefundId,
  RefundMethod,
} from "@/core/modules/refund/refund-types.ts"
import {
  calculateRefundLineAmount,
  deriveRefundableAmount,
  deriveRefundableLines,
  deriveRefundableTipAmount,
  sumGoodsRefundAmounts,
  sumRefundAmounts,
} from "@/core/modules/refund/refund-utils.ts"
import { calculatePaymentExcess } from "@/core/modules/shared/claimed-amount.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "@/core/modules/shared/evolu-utils.ts"
import { getFirstOr } from "@/core/modules/shared/result.ts"
import {
  type FiatCurrency,
  Integer,
  NonNegativeInteger,
  type PositiveNumber,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"

const createRefundPaymentNotPaidError = defineError("RefundPaymentNotPaid")<{
  readonly paymentId: PaymentId
  readonly status: PaymentStatus
}>()
export type RefundPaymentNotPaidError = ReturnType<
  typeof createRefundPaymentNotPaidError
>

const createRefundAmountInvalidError = defineError("RefundAmountInvalid")<{
  readonly amount: NonNegativeInteger
  readonly remainingAmount: NonNegativeInteger
}>()
export type RefundAmountInvalidError = ReturnType<
  typeof createRefundAmountInvalidError
>

const createRefundItemsUnavailableError = defineError(
  "RefundItemsUnavailable"
)<{ readonly paymentId: PaymentId }>()
export type RefundItemsUnavailableError = ReturnType<
  typeof createRefundItemsUnavailableError
>

const createRefundLineUnavailableError = defineError("RefundLineUnavailable")<{
  readonly paymentLineId: PaymentLineId
}>()
export type RefundLineUnavailableError = ReturnType<
  typeof createRefundLineUnavailableError
>

const createRefundTipUnavailableError = defineError("RefundTipUnavailable")<{
  readonly paymentId: PaymentId
}>()
export type RefundTipUnavailableError = ReturnType<
  typeof createRefundTipUnavailableError
>

export type RefundPaymentError =
  | PaymentNotFoundError
  | RefundPaymentNotPaidError
  | RefundAmountInvalidError
  | RefundItemsUnavailableError
  | RefundLineUnavailableError
  | CashRegisterAccountNotFoundError

export interface RefundLineInput {
  readonly paymentLineId: PaymentLineId
  readonly quantity: PositiveNumber
}

interface RefundLineValues extends RefundLineInput {
  readonly amount: NonNegativeInteger
}

const loadRefundLines =
  ({
    paymentId,
    billId,
    lines,
  }: {
    readonly paymentId: PaymentId
    readonly billId: BillId | null
    readonly lines: ReadonlyArray<RefundLineInput>
  }): Task<
    ReadonlyArray<RefundLineValues>,
    RefundItemsUnavailableError | RefundLineUnavailableError,
    EvoluDep
  > =>
  async (run) => {
    const { evolu } = run.deps
    const otherClaimedPayments = await evolu.loadQuery(
      otherClaimedPaymentOfBillQuery(paymentId)
    )
    if (billId === null || otherClaimedPayments.length > 0) {
      return err(createRefundItemsUnavailableError({ paymentId }))
    }

    const [paymentLines, refundedLines] = await Promise.all([
      evolu.loadQuery(refundablePaymentLinesQuery(paymentId)),
      evolu.loadQuery(refundLinesByPaymentIdQuery(paymentId)),
    ])
    const refundableLines = deriveRefundableLines(paymentLines, refundedLines)
    const values: RefundLineValues[] = []
    for (const { paymentLineId, quantity } of lines) {
      const refundable = refundableLines.find(
        ({ line }) => line.id === paymentLineId
      )
      const isRepeated = values.some(
        (value) => value.paymentLineId === paymentLineId
      )
      if (
        refundable === undefined ||
        isRepeated ||
        quantity > refundable.remainingQuantity
      ) {
        return err(createRefundLineUnavailableError({ paymentLineId }))
      }
      values.push({
        paymentLineId,
        quantity,
        amount: calculateRefundLineAmount(refundable, quantity),
      })
    }
    return ok(values)
  }

const loadPaidPayment =
  (
    paymentId: PaymentId
  ): Task<
    InferRow<ReturnType<typeof paymentDetailQuery>>,
    PaymentNotFoundError | RefundPaymentNotPaidError,
    EvoluDep & DateDep
  > =>
  async (run) => {
    const paymentResult = getFirstOr(
      await run.deps.evolu.loadQuery(paymentDetailQuery(paymentId)),
      createPaymentNotFoundError({ id: paymentId })
    )
    if (!paymentResult.ok) return paymentResult
    const payment = paymentResult.value
    const status = await run.ok(loadPaymentStatus(payment))
    if (status !== "paid") {
      return err(createRefundPaymentNotPaidError({ paymentId, status }))
    }
    return ok(payment)
  }

const prepareCashRefund =
  ({
    refundId,
    currency,
    amount,
    deviceId,
    refundedAt,
    now,
  }: {
    readonly refundId: RefundId
    readonly currency: FiatCurrency
    readonly amount: NonNegativeInteger
    readonly deviceId: DeviceId | null
    readonly refundedAt: TimestampMs
    readonly now: Date
  }): Task<
    ReturnType<typeof computeAccountTransactionRows>,
    CashRegisterAccountNotFoundError,
    EvoluDep
  > =>
  async (run) => {
    const accountId = createCashRegisterAccountId(currency)
    const account = getFirstOr(
      await run.deps.evolu.loadQuery(cashRegisterAccountByIdQuery(accountId)),
      createCashRegisterAccountNotFoundError({ id: accountId })
    )
    if (!account.ok) return account
    return ok(
      computeAccountTransactionRows(
        {
          id: deriveCashRefundAccountTransactionId(refundId),
          accountId,
          amount: Integer(-amount),
          currency,
          occurredAt: refundedAt,
          note: null,
          internalTransferGroupId: null,
          source: { deviceId, source: "manual" },
        },
        now
      )
    )
  }

export const refundPayment =
  ({
    paymentId,
    method,
    deviceId,
    amount,
    lines,
  }: {
    readonly paymentId: PaymentId
    readonly method: RefundMethod
    readonly deviceId: DeviceId | null
  } & RequireExactlyOne<{
    readonly amount: NonNegativeInteger
    readonly lines: ReadonlyArray<RefundLineInput>
  }>): Task<
    RefundId,
    RefundPaymentError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const now = run.deps.date.now()
    const paymentResult = await run(loadPaidPayment(paymentId))
    if (!paymentResult.ok) return paymentResult
    const payment = paymentResult.value

    let refundLines: ReadonlyArray<RefundLineValues> = []
    if (lines !== undefined) {
      const linesResult = await run(
        loadRefundLines({
          paymentId,
          billId: payment.billId,
          lines,
        })
      )
      if (!linesResult.ok) return linesResult
      refundLines = linesResult.value
    }

    const refunds = await evolu.loadQuery(refundsByPaymentIdQuery(paymentId))
    const excess = calculatePaymentExcess({
      claims: await evolu.loadQuery(
        activeClaimedTransactionsByPaymentIdQuery(paymentId)
      ),
      amount: payment.amount,
    })
    const remainingAmount = NonNegativeInteger(
      Math.max(
        0,
        deriveRefundableAmount({ ...payment, excess }) -
          sumGoodsRefundAmounts(refunds)
      )
    )
    const refundAmount = amount ?? sumRefundAmounts(refundLines)
    if (refundAmount === 0 || refundAmount > remainingAmount) {
      return err(
        createRefundAmountInvalidError({
          amount: refundAmount,
          remainingAmount,
        })
      )
    }

    const id = createRowId<"Refund">()
    const refundedAt = TimestampMs(now.getTime())
    let cashTransaction: ReturnType<
      typeof computeAccountTransactionRows
    > | null = null
    if (method === "cashRegister") {
      const cashResult = await run(
        prepareCashRefund({
          refundId: id,
          currency: payment.currency,
          amount: refundAmount,
          deviceId,
          refundedAt,
          now,
        })
      )
      if (!cashResult.ok) return cashResult
      cashTransaction = cashResult.value
    }

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }
      evolu.upsert(
        "refund",
        {
          id,
          paymentId,
          deviceId,
          amount: refundAmount,
          currency: payment.currency,
          method,
          refundedAt,
          isDeleted: sqliteFalse,
        },
        mutationOptions
      )
      for (const line of refundLines) {
        evolu.upsert(
          "refundLine",
          {
            id: createRowId<"RefundLine">(),
            refundId: id,
            paymentId,
            paymentLineId: line.paymentLineId,
            quantity: line.quantity,
            amount: line.amount,
            isDeleted: sqliteFalse,
          },
          mutationOptions
        )
      }
      if (cashTransaction !== null) {
        upsertAccountTransactionRows(evolu, cashTransaction, mutationOptions)
      }
    })

    return ok(id)
  }

export type RefundPaymentTipError =
  | PaymentNotFoundError
  | RefundPaymentNotPaidError
  | RefundTipUnavailableError
  | CashRegisterAccountNotFoundError

export const refundPaymentTip =
  ({
    paymentId,
    method,
    deviceId,
  }: {
    readonly paymentId: PaymentId
    readonly method: RefundMethod
    readonly deviceId: DeviceId | null
  }): Task<
    RefundId,
    RefundPaymentTipError,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const now = run.deps.date.now()
    const paymentResult = await run(loadPaidPayment(paymentId))
    if (!paymentResult.ok) return paymentResult
    const payment = paymentResult.value

    const refunds = await evolu.loadQuery(refundsByPaymentIdQuery(paymentId))
    const tipAmount = deriveRefundableTipAmount({ ...payment, refunds })
    if (tipAmount === 0) {
      return err(createRefundTipUnavailableError({ paymentId }))
    }

    const id = createIdFromString<"Refund">(`refund:tip:${paymentId}`)
    const refundedAt = TimestampMs(now.getTime())
    let cashTransaction: ReturnType<
      typeof computeAccountTransactionRows
    > | null = null
    if (method === "cashRegister") {
      const cashResult = await run(
        prepareCashRefund({
          refundId: id,
          currency: payment.currency,
          amount: tipAmount,
          deviceId,
          refundedAt,
          now,
        })
      )
      if (!cashResult.ok) return cashResult
      cashTransaction = cashResult.value
    }

    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, ownerId: evoluOwnerId }
      evolu.upsert(
        "refund",
        {
          id,
          paymentId,
          deviceId,
          amount: tipAmount,
          currency: payment.currency,
          method,
          refundedAt,
          isTip: sqliteTrue,
          isDeleted: sqliteFalse,
        },
        mutationOptions
      )
      if (cashTransaction !== null) {
        upsertAccountTransactionRows(evolu, cashTransaction, mutationOptions)
      }
    })

    return ok(id)
  }
