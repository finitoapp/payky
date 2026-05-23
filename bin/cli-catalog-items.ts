import { ok, sqliteTrue, type Task } from "@evolu/common"
import { type Command, createCommand } from "commander"
import { zodCommand } from "zod-commander/zod4"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  createCatalogItem,
  updateCatalogItem,
} from "../src/core/modules/catalog-item/catalog-item-actions"
import {
  catalogItemByIdQuery,
  catalogItemsQuery,
} from "../src/core/modules/catalog-item/catalog-item-queries"
import {
  FiatCurrencySchema,
  NonEmptyString255Schema,
  NonNegativeIntegerFromStringSchema,
} from "../src/core/modules/shared/schema"
import { removeUndefinedValues } from "../src/core/modules/shared/utils"

export const registerCatalogItemsCommand =
  (program: Command): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  (run) => {
    const { evolu } = run.deps

    const catalogItemsCommand = createCommand("catalog-items").description(
      "Manage reusable catalog items for bills."
    )

    catalogItemsCommand

      .addCommand(
        zodCommand({
          name: "list",
          description: "List active catalog items.",
          args: {},
          opts: {},
          async action() {
            const results = await evolu.loadQuery(catalogItemsQuery)
            run.deps.console.table(results)
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "create",
          description: "Create a catalog item.",
          args: {},
          opts: {
            name: NonEmptyString255Schema.describe("n;Item name"),
            currency: FiatCurrencySchema.describe("c;Item currency"),
            unitAmount:
              NonNegativeIntegerFromStringSchema.describe("a;Unit amount"),
            sortOrder: NonNegativeIntegerFromStringSchema.describe(
              "s;Sort order for menu display"
            ),
            description: NonEmptyString255Schema.optional().describe(
              "Optional item description"
            ),
          },
          async action(_, options) {
            const data = {
              name: options.name,
              ...(options.description
                ? { description: options.description }
                : {}),
              currency: options.currency,
              unitAmount: options.unitAmount,
              sortOrder: options.sortOrder,
            }

            const id = await run.orThrow(createCatalogItem(data))
            run.deps.console.log(
              `Inserted catalogItem ${id}: ${JSON.stringify({
                id: id,
                ...data,
              })}`
            )
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "get",
          description: "Show one catalog item by id.",
          args: {},
          opts: {
            id: CatalogItemId.describe("Catalog item id"),
          },
          async action(_, options) {
            const results = await evolu.loadQuery(
              catalogItemByIdQuery(options.id)
            )
            run.deps.console.table(results)
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "update",
          description: "Update a catalog item.",
          args: {},
          opts: {
            id: CatalogItemId.describe("Catalog item id"),
            name: NonEmptyString255Schema.optional().describe("n;Item name"),
            currency: FiatCurrencySchema.optional().describe("c;Item currency"),
            unitAmount:
              NonNegativeIntegerFromStringSchema.optional().describe(
                "a;Unit amount"
              ),
            sortOrder: NonNegativeIntegerFromStringSchema.optional().describe(
              "s;Sort order for menu display"
            ),
            description: NonEmptyString255Schema.optional().describe(
              "Optional item description"
            ),
          },
          async action(_, options) {
            run.deps.console.log("Updating catalogItem", options.id)
            await run.orThrow(updateCatalogItem(removeUndefinedValues(options)))
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "delete",
          description: "Soft delete a catalog item.",
          args: {},
          opts: {
            id: CatalogItemId.describe("Catalog item id"),
          },
          async action(_, options) {
            run.deps.console.log("Deleting catalogItem", options.id)
            await run.orThrow(
              updateCatalogItem({
                id: options.id,
                isDeleted: sqliteTrue,
              })
            )
          },
        })
      )

    program.addCommand(catalogItemsCommand)
    return ok(undefined)
  }
