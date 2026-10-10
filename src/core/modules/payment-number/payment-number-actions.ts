import { type MutationOptions, ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type {
  PaymentLastNumberRow,
  PaymentNumberRow,
} from "@/core/modules/payment-number/payment-number.ts"
import { paymentLastNumberQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import {
  createNextPaymentNumberValues,
  paymentLastNumberId,
} from "@/core/modules/payment-number/payment-number-utils.ts"
import { loadPaymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import type {
  DateString,
  NonNegativeInteger as NonNegativeIntegerType,
} from "@/core/modules/shared/schema.ts"

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
  }): Task<PaymentNumberRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const paymentNumber = await run.ok(loadNextPaymentNumber({ id, date }))
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      upsertPaymentNumberRows(run.deps.evolu, paymentNumber, {
        ...options,
        ownerId: evoluOwnerId,
      })
    )

    return ok(paymentNumber)
  }

export const updatePaymentLastNumber =
  (input: {
    readonly serialNumber: NonNegativeIntegerType
    readonly date: DateString | null
  }): Task<PaymentLastNumberRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    // Through `createPaymentLastNumberValues`, not a second copy of the same
    // literal: the settings page's manual adjustment has to land on the very
    // row `upsertPaymentNumberRows` writes, or numbering would carry on from
    // a value nobody edited.
    const paymentLastNumber = createPaymentLastNumberValues(input)
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert("paymentLastNumber", paymentLastNumber, {
        ...options,
        ownerId: evoluOwnerId,
      })
    )

    return ok(paymentLastNumber)
  }
