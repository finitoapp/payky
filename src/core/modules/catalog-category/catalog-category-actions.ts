import {
  type InsertValues,
  ok,
  sqliteTrue,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { CatalogCategory } from "@/core/modules/catalog-category/catalog-category.ts"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  getNextSortOrder,
  removeUndefinedValues,
  runMutationWithCompletion,
} from "@/core/modules/shared/utils.ts"
import type { CatalogCategoryId } from "./catalog-category-types.ts"

export const createCatalogCategory =
  (
    input: InsertValues<CatalogCategory>
  ): Task<CatalogCategoryId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps
    const { id } = await runMutationWithCompletion((options) =>
      run.deps.evolu.insert(
        "catalogCategory",
        {
          deviceId: input.deviceId,
          name: input.name,
          sortOrder: input.sortOrder,
        },
        { ...options, ownerId: evoluOwnerId }
      )
    )
    return ok(id)
  }

export const updateCatalogCategory =
  (
    input: UpdateValues<CatalogCategory>
  ): Task<CatalogCategoryId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update("catalogCategory", removeUndefinedValues(input), {
        ...options,
        ownerId: evoluOwnerId,
      })
    )
    return ok(input.id)
  }

/**
 * Creates a catalog category appended after the current last one, deriving
 * `sortOrder` from the highest existing value instead of taking it as input.
 * There is no reorder UI yet, so this is the only way callers assign
 * `sortOrder` when adding a new category.
 */
export const createCatalogCategoryAtEnd =
  (
    input: Omit<InsertValues<CatalogCategory>, "sortOrder">
  ): Task<CatalogCategoryId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const existing = await run.deps.evolu.loadQuery(catalogCategoriesQuery)

    return ok(
      await run.ok(
        createCatalogCategory({
          ...input,
          sortOrder: getNextSortOrder(existing),
        })
      )
    )
  }

export const deleteCatalogCategory =
  (
    id: CatalogCategoryId
  ): Task<CatalogCategoryId, never, EvoluDep & EvoluOwnerIdDep> =>
  async (run) => {
    const { evoluOwnerId } = run.deps

    await runMutationWithCompletion((options) =>
      run.deps.evolu.update(
        "catalogCategory",
        { id, isDeleted: sqliteTrue },
        {
          ...options,
          ownerId: evoluOwnerId,
        }
      )
    )
    return ok(id)
  }
