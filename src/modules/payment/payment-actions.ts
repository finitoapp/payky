import type { InsertValues, Result } from "@evolu/common"

import type { PaymentRow, payment } from "@/modules/payment/payment.ts"
import type { EvoluDep } from "@/modules/shared/evolu-deps.ts"
import { removeUndefinedValues } from "@/modules/shared/utils.ts"
import { type ActionError, getFirst } from "../shared/action-error.ts"
import { paymentByIdQuery } from "./payment-queries.ts"
import type { PaymentId } from "./payment-types.ts"

type CreatePaymentInput = InsertValues<typeof payment>

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
  async (input: CreatePaymentInput): Promise<PaymentId> => {
    const { id } = deps.evolu.insert("payment", removeUndefinedValues(input))
    return id
  }

export const markPaymentPaid =
  (deps: EvoluDep) =>
  async (paymentId: PaymentId): Promise<PaymentId> => {
    deps.evolu.update("payment", {
      id: paymentId,
      status: "paid",
      paidAt: Date.now(),
    })
    return paymentId
  }

export const cancelPayment =
  (deps: EvoluDep) =>
  async (paymentId: PaymentId): Promise<PaymentId> => {
    deps.evolu.update("payment", {
      id: paymentId,
      status: "canceled",
      canceledAt: Date.now(),
    })
    return paymentId
  }
