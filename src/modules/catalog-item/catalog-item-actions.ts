import type { InsertValues, MutationOptions, UpdateValues } from "@evolu/common"
import type { CatalogItem } from "@/modules/catalog-item/catalog-item.ts"
import type { EvoluDep } from "@/modules/shared/evolu-deps.ts"
import { removeUndefinedValues } from "@/modules/shared/utils.ts"
import type { CatalogItemId } from "./catalog-item-types.ts"

export const createCatalogItem =
  (deps: EvoluDep) =>
  (input: InsertValues<CatalogItem>, options?: MutationOptions) => {
    return deps.evolu.insert(
      "catalogItem",
      {
        deviceId: input.deviceId,
        name: input.name,
        description: input.description,
        currency: input.currency,
        unitAmount: input.unitAmount,
        sortOrder: input.sortOrder,
      },
      options
    )
  }

export const updateCatalogItem =
  (deps: EvoluDep) =>
  (
    input: UpdateValues<CatalogItem>,
    options?: MutationOptions
  ): CatalogItemId => {
    deps.evolu.update("catalogItem", removeUndefinedValues(input), options)
    return input.id
  }
