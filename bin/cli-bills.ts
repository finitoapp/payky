import { createRun } from "@evolu/nodejs"
import { createCommand } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"
import { createEvoluCli } from "../src/core/evolu/cli-client"
import {
  addCatalogItemToBill,
  addManualAmountToBill,
  addTipToBill,
  appendRemoveBillLine,
  assignBillToTable,
  cancelBill,
  closeBillAsPaid,
  createBill,
  listOpenBills,
  loadBill,
  partiallyPayBill,
  removeTableFromBill,
  splitBill,
} from "../src/core/modules/bill/bill-actions"
import type { BillLineSummary } from "../src/core/modules/bill/bill-line-summary"
import { BillId } from "../src/core/modules/bill/bill-types"
import { loadCalculatedBillLineSummaries } from "../src/core/modules/bill/bill-utils"
import { CatalogItemId } from "../src/core/modules/catalog-item/catalog-item-types"
import { DeviceId } from "../src/core/modules/device/device-types"
import { PaymentId } from "../src/core/modules/payment/payment-types"
import {
  FiatCurrencySchema,
  NonEmptyString255Schema,
  NonNegativeIntegerFromStringSchema,
  PositiveIntegerFromStringSchema,
  PositiveNumberFromStringSchema,
} from "../src/core/modules/shared/schema"
import { TableId } from "../src/core/modules/table/table-types"

declare const process: {
  exitCode?: number
}

const LineSummaryIdsFromStringSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx): ReadonlyArray<BillLineSummary["id"]> => {
    const ids: Array<BillLineSummary["id"]> = []

    for (const rawId of value.split(",")) {
      const id = rawId.trim()
      if (id.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Line summary id cannot be empty",
        })
        return z.NEVER
      }
      ids.push(id)
    }

    return ids
  })

const findLineSummary = (
  summaries: ReadonlyArray<BillLineSummary>,
  id: BillLineSummary["id"]
): BillLineSummary | null =>
  summaries.find((summary) => summary.id === id) ?? null

export const billsCommand = createCommand("bills").description(
  "Manage bills and bill lines."
)

billsCommand

  .addCommand(
    zodCommand({
      name: "list-open",
      description: "List open bills with item counts and totals.",
      args: {},
      opts: {},
      async action() {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const results = await run.orThrow(listOpenBills())

        console.table(
          results.map(({ bill, items }) => ({
            ...bill,
            itemCount: items.length,
            totalAmount: items.reduce((sum, item) => sum + item.totalAmount, 0),
          }))
        )
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "get",
      description: "Show a bill and its calculated items.",
      args: {},
      opts: {
        id: BillId.describe("Bill id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const bill = await run.orThrow(loadBill(options.id))

        console.table([bill])
        console.table(
          await loadCalculatedBillLineSummaries({ evolu })(options.id)
        )
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "create",
      description: "Create a bill.",
      args: {},
      opts: {
        displayNumber: PositiveIntegerFromStringSchema.describe(
          "n;Displayed bill number"
        ),
        currency: FiatCurrencySchema.describe("c;Bill currency"),
        deviceId: DeviceId.optional().describe(
          "Device id that created the bill"
        ),
        label: NonEmptyString255Schema.optional().describe("l;Bill label"),
        tableId: TableId.optional().describe("t;Table id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const data = {
          deviceId: options.deviceId ?? null,
          displayNumber: options.displayNumber,
          label: options.label ?? null,
          tableId: options.tableId ?? null,
          currency: options.currency,
        }

        const id = await run.orThrow(createBill(data))

        console.log(`Inserted bill ${id}: ${JSON.stringify({ id, ...data })}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "assign-table",
      description: "Assign a bill to a table.",
      args: {},
      opts: {
        id: BillId.describe("Bill id"),
        tableId: TableId.describe("t;Table id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        await run.orThrow(assignBillToTable(options))
        console.log(`Assigned bill ${options.id} to table ${options.tableId}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "remove-table",
      description: "Remove the assigned table from a bill.",
      args: {},
      opts: {
        id: BillId.describe("Bill id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        await run.orThrow(removeTableFromBill(options.id))
        console.log(`Removed table from bill ${options.id}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "add-catalog-item",
      description: "Add a catalog item to a bill.",
      args: {},
      opts: {
        billId: BillId.describe("Bill id"),
        catalogItemId: CatalogItemId.describe("Catalog item id"),
        quantity: PositiveNumberFromStringSchema.describe("q;Item quantity"),
        deviceId: DeviceId.optional().describe("Device id that added the item"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const lineSummary = await run.orThrow(
          addCatalogItemToBill({
            ...options,
            deviceId: options.deviceId ?? null,
          })
        )

        console.table([lineSummary])
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "add-manual-amount",
      description: "Add a manual amount line to a bill.",
      args: {},
      opts: {
        billId: BillId.describe("Bill id"),
        name: NonEmptyString255Schema.describe("n;Line item name"),
        currency: FiatCurrencySchema.describe("c;Line item currency"),
        totalAmount: NonNegativeIntegerFromStringSchema.describe(
          "a;Line total amount"
        ),
        deviceId: DeviceId.optional().describe("Device id that added the line"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const lineSummary = await run.orThrow(
          addManualAmountToBill({
            ...options,
            deviceId: options.deviceId ?? null,
          })
        )

        console.table([lineSummary])
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "add-tip",
      description: "Add a tip line to a bill.",
      args: {},
      opts: {
        billId: BillId.describe("Bill id"),
        name: NonEmptyString255Schema.describe("n;Tip line name"),
        currency: FiatCurrencySchema.describe("c;Tip currency"),
        totalAmount:
          NonNegativeIntegerFromStringSchema.describe("a;Tip total amount"),
        deviceId: DeviceId.optional().describe("Device id that added the tip"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const lineSummary = await run.orThrow(
          addTipToBill({
            ...options,
            deviceId: options.deviceId ?? null,
          })
        )

        console.table([lineSummary])
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "remove-item",
      description: "Append a removal line for a bill line summary.",
      args: {},
      opts: {
        billId: BillId.describe("Bill id"),
        lineSummaryId: z.string().trim().min(1).describe("Line summary id"),
        quantity: PositiveNumberFromStringSchema.describe(
          "q;Quantity to remove"
        ),
        totalAmount:
          NonNegativeIntegerFromStringSchema.describe("a;Amount to remove"),
        deviceId: DeviceId.optional().describe(
          "Device id that removed the item"
        ),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const lineSummary = findLineSummary(
          await loadCalculatedBillLineSummaries({ evolu })(options.billId),
          options.lineSummaryId
        )
        if (lineSummary == null) {
          console.error(`Line summary not found: ${options.lineSummaryId}`)
          process.exitCode = 1
          return
        }

        const updatedLineSummary = await run.orThrow(
          appendRemoveBillLine({
            billId: options.billId,
            deviceId: options.deviceId ?? null,
            lineSummary,
            quantity: options.quantity,
            totalAmount: options.totalAmount,
          })
        )

        console.table(updatedLineSummary == null ? [] : [updatedLineSummary])
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "split",
      description:
        "Move selected bill line summaries from one bill to another.",
      args: {},
      opts: {
        sourceBillId: BillId.describe("Source bill id"),
        targetBillId: BillId.describe("Target bill id"),
        lineSummaryIds: LineSummaryIdsFromStringSchema.describe(
          "Comma-separated line summary ids"
        ),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        const sourceItems = await loadCalculatedBillLineSummaries({ evolu })(
          options.sourceBillId
        )
        const selectedItems: BillLineSummary[] = []

        for (const id of options.lineSummaryIds) {
          const lineSummary = findLineSummary(sourceItems, id)
          if (lineSummary == null) {
            console.error(`Line summary not found: ${id}`)
            process.exitCode = 1
            return
          }
          selectedItems.push(lineSummary)
        }

        const result = await run.orThrow(
          splitBill({
            sourceBillId: options.sourceBillId,
            targetBillId: options.targetBillId,
            items: selectedItems,
          })
        )

        console.table([result.bill])
        console.table(result.items)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "partial-pay",
      description: "Mark a bill as partially paid by a payment.",
      args: {},
      opts: {
        id: BillId.describe("Bill id"),
        paymentId: PaymentId.describe("Payment id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        await run.orThrow(partiallyPayBill(options))
        console.log(`Marked bill ${options.id} as partially paid`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "cancel",
      description: "Cancel a bill.",
      args: {},
      opts: {
        id: BillId.describe("Bill id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        await run.orThrow(cancelBill(options.id))
        console.log(`Canceled bill ${options.id}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "close-paid",
      description: "Close a bill as fully paid.",
      args: {},
      opts: {
        id: BillId.describe("Bill id"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli
        const run = createRun({ evolu })

        await run.orThrow(closeBillAsPaid(options.id))
        console.log(`Closed bill ${options.id} as paid`)
      },
    })
  )
