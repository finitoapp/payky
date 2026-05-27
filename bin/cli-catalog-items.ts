import { sqliteTrue } from "@evolu/common"
import { createCommand } from "commander"
import { zodCommand } from "zod-commander/zod4"
import { CatalogItemId } from "@/modules/catalog-item/catalog-item-types.ts"
import { createEvoluCli } from "../src/evolu/cli-client"
import {
  createCatalogItem,
  updateCatalogItem,
} from "../src/modules/catalog-item/catalog-item-actions"
import {
  catalogItemByIdQuery,
  catalogItemsQuery,
} from "../src/modules/catalog-item/catalog-item-queries"
import {
  FiatCurrencySchema,
  NonEmptyString255Schema,
  NonNegativeIntegerFromStringSchema,
} from "../src/modules/shared/schema"
import {
  removeUndefinedValues,
  runMutationWithCompletion,
} from "../src/modules/shared/utils"

export const catalogItemsCommand = createCommand("catalog-items")

catalogItemsCommand

  .addCommand(
    zodCommand({
      name: "list",
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
      args: {},
      opts: {
        name: NonEmptyString255Schema.describe("n;"),
        currency: FiatCurrencySchema.describe("c;"),
        unitAmount: NonNegativeIntegerFromStringSchema.describe("a;"),
        sortOrder: NonNegativeIntegerFromStringSchema.describe("s;"),
        description: NonEmptyString255Schema.optional(),
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
      args: {},
      opts: {
        id: CatalogItemId,
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
      args: {},
      opts: {
        id: CatalogItemId,
        name: NonEmptyString255Schema.optional().describe("n;"),
        currency: FiatCurrencySchema.optional().describe("c;"),
        unitAmount:
          NonNegativeIntegerFromStringSchema.optional().describe("a;"),
        sortOrder: NonNegativeIntegerFromStringSchema.optional().describe("s;"),
        description: NonEmptyString255Schema.optional(),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        console.log("Deleting catalogItem", options.id)

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
      args: {},
      opts: {
        id: CatalogItemId,
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
