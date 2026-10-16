import { type MutationOptions, ok, type Task } from "@evolu/common"

import type { EvoluOwnerDep } from "../../deps.ts"
import type { PaymentId } from "../payment/payment-types.ts"
import { loadPaymentNumberSeries } from "../payment-number-series/payment-number-series-actions.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import type {
  DateString,
  NonNegativeInteger as NonNegativeIntegerType,
} from "../shared/schema.ts"
import type {
  PaymentLastNumberRow,
  PaymentNumberRow,
} from "./payment-number.ts"
import { paymentLastNumberQuery } from "./payment-number-queries.ts"
import {
  createNextPaymentNumberValues,
  paymentLastNumberId,
} from "./payment-number-utils.ts"

export const createPaymentLastNumberValues = ({
  serialNumber,
  date,
}: {
  readonly serialNumber: NonNegativeIntegerType
  readonly date: DateString | null
}): PaymentLastNumberRow => ({
  id: paymentLastNumberId,
  serialNumber,
  date,
})

/**
 * Loads the current series and the previous number, then computes the next
 * payment number without writing it. Exported so callers that need to fold
 * the write into a larger mutation batch (e.g. `createPayment`) can reuse the
 * same load-and-compute logic instead of duplicating it.
 */
export const loadNextPaymentNumber =
  ({
    id,
    date,
  }: {
    readonly id: PaymentId
    readonly date: DateString
  }): Task<PaymentNumberRow, never, EvoluDep> =>
  async (run) => {
    // Neither read depends on the other, and neither writes.
    const [series, [previous]] = await Promise.all([
      run.ok(loadPaymentNumberSeries()),
      run.deps.evolu.loadQuery(paymentLastNumberQuery),
    ])

    return ok(
      createNextPaymentNumberValues({
        id,
        date,
        series,
        previous,
      })
    )
  }

/**
 * Upserts `paymentNumber` and `paymentLastNumber` for an already-computed
 * payment number. Takes the caller's own `MutationOptions` so the writes can
 * join an existing mutation batch instead of always opening a new one.
 */
export const upsertPaymentNumberRows = (
  evolu: EvoluDep["evolu"],
  paymentNumber: PaymentNumberRow,
  options: MutationOptions
): void => {
  evolu.upsert("paymentNumber", paymentNumber, options)
  evolu.upsert(
    "paymentLastNumber",
    createPaymentLastNumberValues(paymentNumber),
    options
  )
}

export const createNextPaymentNumber =
  ({
    id,
    date,
  }: {
    readonly id: PaymentId
    readonly date: DateString
  }): Task<PaymentNumberRow, never, EvoluDep & EvoluOwnerDep> =>
  async (run) => {
    const paymentNumber = await run.ok(loadNextPaymentNumber({ id, date }))
    const { evoluOwner } = run.deps

    await runMutationWithCompletion((options) =>
      upsertPaymentNumberRows(run.deps.evolu, paymentNumber, {
        ...options,
        owner: evoluOwner,
      })
    )

    return ok(paymentNumber)
  }

export const updatePaymentLastNumber =
  (input: {
    readonly serialNumber: NonNegativeIntegerType
    readonly date: DateString | null
  }): Task<PaymentLastNumberRow, never, EvoluDep & EvoluOwnerDep> =>
  async (run) => {
    // Through `createPaymentLastNumberValues`, not a second copy of the same
    // literal: the settings page's manual adjustment has to land on the very
    // row `upsertPaymentNumberRows` writes, or numbering would carry on from
    // a value nobody edited.
    const paymentLastNumber = createPaymentLastNumberValues(input)
    const { evoluOwner } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert("paymentLastNumber", paymentLastNumber, {
        ...options,
        owner: evoluOwner,
      })
    )

    return ok(paymentLastNumber)
  }
