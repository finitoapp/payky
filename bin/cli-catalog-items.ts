import { sqliteTrue } from "@evolu/common"
import { createCommand } from "commander"
import { zodCommand } from "zod-commander/zod4"
import { CatalogItemId } from "@/core/modules/catalog-item/catalog-item-types.ts"
import { createEvoluCli } from "../src/core/evolu/cli-client"
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
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "../src/core/modules/shared/utils"

export const catalogItemsCommand = createCommand("catalog-items").description(
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
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const results = await evolu.loadQuery(catalogItemsQuery)

        console.table(results)
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
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const data = {
          name: options.name,
          ...(options.description ? { description: options.description } : {}),
          currency: options.currency,
          unitAmount: options.unitAmount,
          sortOrder: options.sortOrder,
        }

        const { id } = await runMutationWithCompletion((options) =>
          createCatalogItem({ evolu })(data, options)
        )
        console.log(
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
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const results = await evolu.loadQuery(catalogItemByIdQuery(options.id))
        console.table(results)
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
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.log("Updating catalogItem", options.id)

        await runMutationWithCompletion((mutationOptions) =>
          updateCatalogItem({ evolu })(
            removeUndefinedValues(options),
            mutationOptions
          )
        )
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
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.log("Deleting catalogItem", options.id)

        await runMutationWithCompletion((mutationOptions) =>
          updateCatalogItem({ evolu })(
            {
              id: options.id,
              isDeleted: sqliteTrue,
            },
            mutationOptions
          )
        )
      },
    })
  )
