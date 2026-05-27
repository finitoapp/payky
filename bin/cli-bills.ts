import { createCommand } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"
import { createEvoluCli } from "../src/core/evolu/cli-client"
import {
  addCatalogItemToBill,
  addManualAmountToBill,
  addTipToBill,
  appendRemoveBillItemLine,
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
import { BillId } from "../src/core/modules/bill/bill-types"
import { loadCalculatedBillItems } from "../src/core/modules/bill/bill-utils"
import type { BillItemRow } from "../src/core/modules/bill-item/bill-item"
import { BillItemId } from "../src/core/modules/bill-item/bill-item-types"
import { CatalogItemId } from "../src/core/modules/catalog-item/catalog-item-types"
import { DeviceId } from "../src/core/modules/device/device-types"
import { PaymentId } from "../src/core/modules/payment/payment-types"
import type { ActionError } from "../src/core/modules/shared/action-error"
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

const BillItemIdsFromStringSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value, ctx): ReadonlyArray<z.output<typeof BillItemId>> => {
    const ids: Array<z.output<typeof BillItemId>> = []

    for (const rawId of value.split(",")) {
      const parsed = BillItemId.safeParse(rawId.trim())
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid bill item id: ${rawId}`,
        })
        return z.NEVER
      }
      ids.push(parsed.data)
    }

    return ids
  })

const printActionError = (error: ActionError): void => {
  if (error.type === "NotFound") {
    console.error(`${error.entity} not found: ${error.id}`)
    process.exitCode = 1
    return
  }

  console.error(error.message)
  process.exitCode = 1
}

const findBillItem = (
  items: ReadonlyArray<BillItemRow>,
  id: z.output<typeof BillItemId>
): BillItemRow | null => items.find((item) => item.id === id) ?? null

export const billsCommand = createCommand("bills")

billsCommand

  .addCommand(
    zodCommand({
      name: "list-open",
      args: {},
      opts: {},
      async action() {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const results = await listOpenBills({ evolu })()

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
      args: {},
      opts: {
        id: BillId,
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const billResult = await loadBill({ evolu })(options.id)
        if (!billResult.ok) {
          printActionError(billResult.error)
          return
        }

        console.table([billResult.value])
        console.table(await loadCalculatedBillItems({ evolu })(options.id))
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "create",
      args: {},
      opts: {
        displayNumber: PositiveIntegerFromStringSchema.describe("n;"),
        currency: FiatCurrencySchema.describe("c;"),
        deviceId: DeviceId.optional(),
        label: NonEmptyString255Schema.optional().describe("l;"),
        tableId: TableId.optional().describe("t;"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const data = {
          deviceId: options.deviceId ?? null,
          displayNumber: options.displayNumber,
          label: options.label ?? null,
          tableId: options.tableId ?? null,
          currency: options.currency,
        }

        const id = await createBill({ evolu })(data)

        console.log(`Inserted bill ${id}: ${JSON.stringify({ id, ...data })}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "assign-table",
      args: {},
      opts: {
        id: BillId,
        tableId: TableId.describe("t;"),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        await assignBillToTable({ evolu })(options)
        console.log(`Assigned bill ${options.id} to table ${options.tableId}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "remove-table",
      args: {},
      opts: {
        id: BillId,
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        await removeTableFromBill({ evolu })(options.id)
        console.log(`Removed table from bill ${options.id}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "add-catalog-item",
      args: {},
      opts: {
        billId: BillId,
        catalogItemId: CatalogItemId,
        quantity: PositiveNumberFromStringSchema.describe("q;"),
        deviceId: DeviceId.optional(),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const result = await addCatalogItemToBill({ evolu })({
          ...options,
          deviceId: options.deviceId ?? null,
        })
        if (!result.ok) {
          printActionError(result.error)
          return
        }

        console.table([result.value])
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "add-manual-amount",
      args: {},
      opts: {
        billId: BillId,
        name: NonEmptyString255Schema.describe("n;"),
        currency: FiatCurrencySchema.describe("c;"),
        totalAmount: NonNegativeIntegerFromStringSchema.describe("a;"),
        deviceId: DeviceId.optional(),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const result = await addManualAmountToBill({ evolu })({
          ...options,
          deviceId: options.deviceId ?? null,
        })
        if (!result.ok) {
          printActionError(result.error)
          return
        }

        console.table([result.value])
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "add-tip",
      args: {},
      opts: {
        billId: BillId,
        name: NonEmptyString255Schema.describe("n;"),
        currency: FiatCurrencySchema.describe("c;"),
        totalAmount: NonNegativeIntegerFromStringSchema.describe("a;"),
        deviceId: DeviceId.optional(),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const result = await addTipToBill({ evolu })({
          ...options,
          deviceId: options.deviceId ?? null,
        })
        if (!result.ok) {
          printActionError(result.error)
          return
        }

        console.table([result.value])
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "remove-item",
      args: {},
      opts: {
        billId: BillId,
        billItemId: BillItemId,
        quantity: PositiveNumberFromStringSchema.describe("q;"),
        totalAmount: NonNegativeIntegerFromStringSchema.describe("a;"),
        deviceId: DeviceId.optional(),
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const billItem = findBillItem(
          await loadCalculatedBillItems({ evolu })(options.billId),
          options.billItemId
        )
        if (billItem == null) {
          console.error(`billItem not found: ${options.billItemId}`)
          process.exitCode = 1
          return
        }

        const result = await appendRemoveBillItemLine({ evolu })({
          billId: options.billId,
          deviceId: options.deviceId ?? null,
          billItem,
          quantity: options.quantity,
          totalAmount: options.totalAmount,
        })
        if (!result.ok) {
          printActionError(result.error)
          return
        }

        console.table(result.value == null ? [] : [result.value])
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "split",
      args: {},
      opts: {
        sourceBillId: BillId,
        targetBillId: BillId,
        billItemIds: BillItemIdsFromStringSchema,
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        const sourceItems = await loadCalculatedBillItems({ evolu })(
          options.sourceBillId
        )
        const selectedItems: BillItemRow[] = []

        for (const id of options.billItemIds) {
          const billItem = findBillItem(sourceItems, id)
          if (billItem == null) {
            console.error(`billItem not found: ${id}`)
            process.exitCode = 1
            return
          }
          selectedItems.push(billItem)
        }

        const result = await splitBill({ evolu })({
          sourceBillId: options.sourceBillId,
          targetBillId: options.targetBillId,
          items: selectedItems,
        })
        if (!result.ok) {
          printActionError(result.error)
          return
        }

        console.table([result.value.bill])
        console.table(result.value.items)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "partial-pay",
      args: {},
      opts: {
        id: BillId,
        paymentId: PaymentId,
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        await partiallyPayBill({ evolu })(options)
        console.log(`Marked bill ${options.id} as partially paid`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "cancel",
      args: {},
      opts: {
        id: BillId,
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        await cancelBill({ evolu })(options.id)
        console.log(`Canceled bill ${options.id}`)
      },
    })
  )

  .addCommand(
    zodCommand({
      name: "close-paid",
      args: {},
      opts: {
        id: BillId,
      },
      async action(_, options) {
        await using evoluCli = await createEvoluCli()
        const { evolu } = evoluCli

        await closeBillAsPaid({ evolu })(options.id)
        console.log(`Closed bill ${options.id} as paid`)
      },
    })
  )
