import { type MutationOptions, ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type {
  PaymentLastNumberRow,
  PaymentNumberRow,
} from "@/core/modules/payment-number/payment-number.ts"
import { paymentLastNumberQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import { paymentLastNumberId } from "@/core/modules/payment-number/payment-number-utils.ts"
import type { PaymentNumberSeriesRow } from "@/core/modules/payment-number-series/payment-number-series.ts"
import { getPaymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  type DateString,
  DateStringSchema,
  NonNegativeInteger,
  type NonNegativeInteger as NonNegativeIntegerType,
} from "@/core/modules/shared/schema.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"

interface PreviousPaymentNumber {
  readonly date: DateString | null
  readonly serialNumber: NonNegativeIntegerType
}

const getNumberingPeriod = (
  date: DateString,
  series: PaymentNumberSeriesRow
): string => {
  if (series.dayFormat !== "hidden") return date
  if (series.monthFormat !== "hidden") return date.slice(0, 7)
  return date.slice(0, 4)
}

export const createPaymentNumberDate = (date: Date): DateString =>
  DateStringSchema.decode(
    [
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-")
  )

export const createNextPaymentNumberValues = ({
  id,
  date,
  series,
  previous,
}: {
  readonly id: PaymentId
  readonly date: DateString
  readonly series: PaymentNumberSeriesRow
  readonly previous?: PreviousPaymentNumber
}): PaymentNumberRow => {
  const currentPeriod = getNumberingPeriod(date, series)
  const previousPeriod =
    previous?.date === null || previous?.date === undefined
      ? null
      : getNumberingPeriod(previous.date, series)
  const serialNumber = NonNegativeInteger(
    previous !== undefined && previousPeriod === currentPeriod
      ? previous.serialNumber + 1
      : 1
  )

  return {
    id,
    serialNumber,
    date,
  }
}

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
  }): Task<PaymentNumberRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const series = await run.ok(getPaymentNumberSeries())
    const [previous] = await run.deps.evolu.loadQuery(paymentLastNumberQuery)

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
  ({
    serialNumber,
    date,
  }: {
    readonly serialNumber: NonNegativeIntegerType
    readonly date: DateString | null
  }): Task<PaymentLastNumberRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const paymentLastNumber = {
      id: paymentLastNumberId,
      serialNumber,
      date,
    } satisfies PaymentLastNumberRow
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert("paymentLastNumber", paymentLastNumber, {
        ...options,
        ownerId: evoluOwnerId,
      })
    )

    return ok(paymentLastNumber)
  }
