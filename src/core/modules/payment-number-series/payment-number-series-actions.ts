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

export const getPaymentNumberSeries =
  (): Task<PaymentNumberSeriesRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const existing = (
      await run.deps.evolu.loadQuery(paymentNumberSeriesQuery)
    )[0]
    if (existing != null) return ok(existing)

    const defaults = createDefaultPaymentNumberSeries()
    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert("paymentNumberSeries", defaults, {
        ...options,
        ownerId: evoluOwnerId,
      })
    )
    return ok(defaults)
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
