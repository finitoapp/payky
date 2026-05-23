import { ok, type Task } from "@evolu/common"
import { type Command, createCommand } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  getPaymentNumberSeries,
  updatePaymentNumberSeries,
} from "../src/core/modules/payment-number-series/payment-number-series-actions"
import {
  NonEmptyString255Schema,
  PositiveIntegerFromStringSchema,
} from "../src/core/modules/shared/schema"

const YearFormatSchema = z.enum(["default", "short"])
const DatePartFormatSchema = z.enum(["default", "hidden"])
const PrefixOptionSchema = z.string().transform((value, ctx) => {
  const trimmed = value.trim()
  if (trimmed === "null") return null

  const parsed = NonEmptyString255Schema.safeParse(trimmed)
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      message: "Expected a non-empty prefix up to 255 characters or 'null'.",
    })
    return z.NEVER
  }

  return parsed.data
})

export const registerPaymentNumberSeriesCommand =
  (program: Command): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  (run) => {
    const paymentNumberSeriesCommand = createCommand(
      "payment-number-series"
    ).description("Manage deterministic payment number series settings.")

    paymentNumberSeriesCommand

      .addCommand(
        zodCommand({
          name: "get",
          description:
            "Show payment number series settings, creating defaults if missing.",
          args: {},
          opts: {},
          async action() {
            const series = await run.orThrow(getPaymentNumberSeries())
            run.deps.console.table([series])
          },
        })
      )

      .addCommand(
        zodCommand({
          name: "update",
          description:
            "Update payment number series settings. Use --prefix null to clear the prefix.",
          args: {},
          opts: {
            serialNumberDigits:
              PositiveIntegerFromStringSchema.optional().describe(
                "s;Minimum digits for the increasing serial part"
              ),
            yearFormat: YearFormatSchema.optional().describe(
              "y;Year format: default or short"
            ),
            monthFormat: DatePartFormatSchema.optional().describe(
              "m;Month format: default or hidden"
            ),
            dayFormat: DatePartFormatSchema.optional().describe(
              "d;Day format: default or hidden"
            ),
            prefix: PrefixOptionSchema.optional().describe(
              "p;Optional prefix, or 'null' to clear it"
            ),
          },
          async action(_, options) {
            const id = await run.orThrow(
              updatePaymentNumberSeries({
                serialNumberDigits: options.serialNumberDigits,
                yearFormat: options.yearFormat,
                monthFormat: options.monthFormat,
                dayFormat: options.dayFormat,
                prefix: options.prefix,
              })
            )

            run.deps.console.log(`Updated payment number series ${id}`)
          },
        })
      )

    program.addCommand(paymentNumberSeriesCommand)
    return ok(undefined)
  }
