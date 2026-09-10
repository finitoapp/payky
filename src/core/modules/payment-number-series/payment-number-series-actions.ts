import { ok, type Task, type UpdateValues } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type {
  PaymentNumberSeriesRow,
  paymentNumberSeries,
} from "@/core/modules/payment-number-series/payment-number-series.ts"
import type { PaymentNumberSeriesId } from "@/core/modules/payment-number-series/payment-number-series-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import { paymentNumberSeriesQuery } from "./payment-number-series-queries.ts"
import {
  createDefaultPaymentNumberSeries,
  paymentNumberSeriesId,
} from "./payment-number-series-utils.ts"

/**
 * The stored numbering series, or the defaults when there is none.
 *
 * A missing row means "nobody has changed the numbering", not "the series is
 * unknown": the id is fixed (`paymentNumberSeriesId`) and the defaults are a
 * pure function, so the row only has to exist once someone saves settings —
 * which is how the settings page already reads it
 * (`storedSeries ?? createDefaultPaymentNumberSeries()`).
 *
 * This used to seed that row on first read, inside a mutation batch of its
 * own. Every payment's numbering runs through here, so the first payment ever
 * created on a device paid a second awaited round trip to write a row nothing
 * reads — and a read that writes is a trap for callers folding their own
 * writes into one batch (see AGENTS.md).
 */
export const loadPaymentNumberSeries =
  (): Task<PaymentNumberSeriesRow, never, EvoluDep> => async (run) => {
    const [existing] = await run.deps.evolu.loadQuery(paymentNumberSeriesQuery)

    return ok(existing ?? createDefaultPaymentNumberSeries())
  }

export const updatePaymentNumberSeries =
  (
    input: Omit<UpdateValues<typeof paymentNumberSeries>, "id">
  ): Task<PaymentNumberSeriesId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "paymentNumberSeries",
        removeUndefinedValues({
          ...createDefaultPaymentNumberSeries(),
          ...input,
          id: paymentNumberSeriesId,
        }),
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(paymentNumberSeriesId)
  }
