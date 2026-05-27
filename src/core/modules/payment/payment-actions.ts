import type { InsertValues, Result } from "@evolu/common"

import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import type {
  PaymentRow,
  payment,
  paymentCashRegister,
  paymentIban,
  paymentSpark,
} from "@/core/modules/payment/payment.ts"
import type { ReconciliationClaimSource } from "@/core/modules/reconciliation-claim/reconciliation-claim.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { type ActionError, getFirst } from "../shared/action-error.ts"
import { paymentByIdQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

export const loadPayment =
  (deps: EvoluDep) =>
  async (idValue: PaymentId): Promise<Result<PaymentRow, ActionError>> =>
    getFirst(
      await deps.evolu.loadQuery(paymentByIdQuery(idValue)),
      "payment",
      idValue
    )

export const createPayment =
  (deps: EvoluDep) =>
  async ({
    cashRegister,
    spark,
    iban,
    ...input
  }: InsertValues<typeof payment> & {
    readonly cashRegister?: Omit<InsertValues<typeof paymentCashRegister>, "id">
    readonly spark?: Omit<InsertValues<typeof paymentSpark>, "id">
    readonly iban?: Omit<InsertValues<typeof paymentIban>, "id">
  }): Promise<PaymentId> => {
    const id = createTableId<"Payment">()

    await runMutationWithCompletion((options) => {
      if (cashRegister) {
        deps.evolu.upsert(
          "paymentCashRegister",
          removeUndefinedValues({
            ...cashRegister,
            id,
          }),
          options
        )
      }

      if (spark) {
        deps.evolu.upsert(
          "paymentSpark",
          removeUndefinedValues({
            ...spark,
            id,
          }),
          options
        )
      }

      if (iban) {
        deps.evolu.upsert(
          "paymentIban",
          removeUndefinedValues({
            ...iban,
            id,
          }),
          options
        )
      }

      return deps.evolu.upsert(
        "payment",
        removeUndefinedValues({
          ...input,
          id,
        }),
        options
      )
    })

    return id
  }

export const markPaymentPaid =
  (deps: EvoluDep) =>
  async (
    paymentId: PaymentId,
    accountTransactionId: AccountTransactionId,
    source: ReconciliationClaimSource = "manual"
  ): Promise<PaymentId> => {
    const id = createTableId<"ReconciliationClaim">()

    await runMutationWithCompletion((options) =>
      deps.evolu.upsert(
        "reconciliationClaim",
        removeUndefinedValues({
          id,
          deviceId: null,
          paymentId,
          accountTransactionId,
          source,
          claimedAt: Date.now(),
        }),
        options
      )
    )

    return paymentId
  }

export const cancelPayment =
  (deps: EvoluDep) =>
  async (paymentId: PaymentId): Promise<PaymentId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "payment",
        {
          id: paymentId,
          canceledAt: Date.now(),
        },
        options
      )
    )

    return paymentId
  }
