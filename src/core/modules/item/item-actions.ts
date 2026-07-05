import { ok, type Task } from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import type { ItemRow } from "./item.ts"
import { createCatalogItemSnapshot } from "./item-utils.ts"

export const createOrReuseItemSnapshot =
  (snapshot: ItemRow): Task<ItemRow, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert("item", snapshot, {
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
      await run.orThrow(
        createOrReuseItemSnapshot(createCatalogItemSnapshot(catalogItem))
      )
    )
