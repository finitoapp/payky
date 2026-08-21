import { type MutationOptions, ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import type { ItemRow } from "./item.ts"
import { createCatalogItemSnapshot } from "./item-utils.ts"

/**
 * Upserts an already-computed item snapshot. Takes the caller's own
 * `MutationOptions` so the write can join an existing mutation batch instead
 * of always opening a new one.
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
