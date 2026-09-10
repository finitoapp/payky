import { type MutationOptions, ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import type { ItemRow } from "./item.ts"
import { createCatalogItemSnapshot } from "./item-utils.ts"

/**
 * Upserts an already-computed item snapshot.
 *
 * Thin on purpose, and not inlinable: an actions file writes only its own
 * module's tables (AGENTS.md), so this is how `bill-actions.ts` puts an `item`
 * row in the same batch as the bill lines pointing at it — the alternative
 * being either `evolu.upsert("item", ...)` from another module, or a Task that
 * opens a batch of its own. Same load/compute-plus-plain-upsert split as
 * `payment-number-actions.ts`'s `upsertPaymentNumberRows`.
 */
export const upsertItemSnapshot = (
  evolu: EvoluDep["evolu"],
  snapshot: ItemRow,
  options: MutationOptions
): void => {
  evolu.upsert("item", snapshot, options)
}

export const createOrReuseItemSnapshot =
  (snapshot: ItemRow): Task<ItemRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      upsertItemSnapshot(run.deps.evolu, snapshot, {
        ...options,
        ownerId: evoluOwnerId,
      })
    )
    return ok(snapshot)
  }

export const createOrReuseCatalogItemSnapshot =
  (
    catalogItem: CatalogItemRow
  ): Task<ItemRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) =>
    ok(
      await run.ok(
        createOrReuseItemSnapshot(createCatalogItemSnapshot(catalogItem))
      )
    )
