import type { InsertValues, Result } from "@evolu/common"

import type { AccountTransactionId } from "@/modules/account-transaction/account-transaction-types.ts"
import type {
  PaymentRow,
  payment,
  paymentCashRegister,
  paymentIban,
  paymentSpark,
} from "@/modules/payment/payment.ts"
import type { EvoluDep } from "@/modules/shared/evolu-deps.ts"
import {
  createTableId,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/modules/shared/utils.ts"
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
  }: Omit<InsertValues<typeof payment>, "accountTransactionId"> & {
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
          accountTransactionId: undefined,
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
    accountTransactionId: AccountTransactionId
  ): Promise<PaymentId> => {
    await runMutationWithCompletion((options) =>
      deps.evolu.update(
        "payment",
        {
          id: paymentId,
          status: "paid",
          accountTransactionId,
          paidAt: Date.now(),
        },
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
          status: "canceled",
          canceledAt: Date.now(),
        },
        options
      )
    )

    return paymentId
  }
