import {
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { CatalogItem } from "@/core/modules/catalog-item/catalog-item.ts"
import { catalogItemsQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type { CatalogItemId } from "./catalog-item-types.ts"

export const createCatalogItem =
  (
    input: InsertValues<CatalogItem>
  ): Task<CatalogItemId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const { id } = await runMutationWithCompletion((options) =>
      run.deps.evolu.insert(
        "catalogItem",
        {
          deviceId: input.deviceId,
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          currency: input.currency,
          unitAmount: input.unitAmount,
          sortOrder: input.sortOrder,
          scanCode: input.scanCode,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(id)
  }

export const updateCatalogItem =
  (
    input: UpdateValues<CatalogItem>
  ): Task<CatalogItemId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update("catalogItem", removeUndefinedValues(input), {
        ...options,
        ownerId: evoluOwnerId,
      })
    )
    return ok(input.id)
  }

/**
 * Creates a catalog item appended after the current last one, deriving
 * `sortOrder` from the highest existing value instead of taking it as input.
 * There is no reorder UI yet, so this is the only way callers assign
 * `sortOrder` when adding a new item.
 */
export const createCatalogItemAtEnd =
  (
    input: Omit<InsertValues<CatalogItem>, "sortOrder">
  ): Task<CatalogItemId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const existing = await run.deps.evolu.loadQuery(catalogItemsQuery)
    const lastSortOrder = existing.at(-1)?.sortOrder ?? -1

    return ok(
      await run.ok(
        createCatalogItem({
          ...input,
          sortOrder: NonNegativeInteger(lastSortOrder + 1),
        })
      )
    )
  }

export const deleteCatalogItem =
  (id: CatalogItemId): Task<CatalogItemId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "catalogItem",
        { id, isDeleted: sqliteTrue },
        {
          ...options,
          ownerId: evoluOwnerId,
        }
      )
    )
    return ok(id)
  }
