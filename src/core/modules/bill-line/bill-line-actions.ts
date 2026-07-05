import { ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { BillId } from "@/core/modules/bill/bill-types.ts"
import { itemsQuery } from "@/core/modules/item/item-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type { BillLineRow } from "./bill-line.ts"
import { billLinesByBillIdQuery } from "./bill-line-queries.ts"
import type { BillLineSummary } from "./bill-line-summary.ts"
import { calculateBillLineSummaries } from "./bill-line-utils.ts"

export const loadCalculatedBillLineSummaries =
  (billId: BillId): Task<ReadonlyArray<BillLineSummary>, never, EvoluDep> =>
  async (run) => {
    const [lineRows, itemRows] = await Promise.all([
      run.deps.evolu.loadQuery(billLinesByBillIdQuery(billId)),
      run.deps.evolu.loadQuery(itemsQuery),
    ])

    return ok(calculateBillLineSummaries(lineRows, itemRows))
  }

export const appendBillLines =
  (
    lines: ReadonlyArray<Omit<BillLineRow, "id">>,
    returnBillId?: BillId
  ): Task<ReadonlyArray<BillLineSummary>, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    if (lines.length > 0) {
      await runMutationWithCompletion((options) => {
        for (const line of lines) {
          run.deps.evolu.insert("billLine", removeUndefinedValues(line), {
            ...options,
            ownerId: evoluOwnerId,
          })
        }
      })
    }

    const targetBillId = returnBillId ?? lines.at(-1)?.billId
    if (targetBillId === undefined) {
      return ok([])
    }

    const billIds = new Set<BillId>([targetBillId])
    for (const line of lines) {
      billIds.add(line.billId)
    }
    const summariesByBill = new Map(
      await Promise.all(
        [...billIds].map(
          async (lineBillId) =>
            [
              lineBillId,
              await run.orThrow(loadCalculatedBillLineSummaries(lineBillId)),
            ] as const
        )
      )
    )

    return ok(summariesByBill.get(targetBillId) ?? [])
  }

export const appendBillLine =
  (
    line: Omit<BillLineRow, "id">
  ): Task<ReadonlyArray<BillLineSummary>, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) =>
    ok(await run.orThrow(appendBillLines([line])))
