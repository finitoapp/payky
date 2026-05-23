import {
  type InsertValues,
  ok,
  type Task,
  type UpdateValues,
} from "@evolu/common"

import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { CatalogItem } from "@/core/modules/catalog-item/catalog-item.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
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
          name: input.name,
          description: input.description,
          currency: input.currency,
          unitAmount: input.unitAmount,
          sortOrder: input.sortOrder,
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
