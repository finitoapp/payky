import { type ConsoleDep, err, ok, type Run, type Task } from "@evolu/common"
import {
  isStepCount,
  type LanguageModel,
  streamText,
  type ToolSet,
  tool,
} from "ai"
import { z } from "zod"
import { defineError } from "@/core/error.ts"
import { listOpenBills } from "@/core/modules/bill/bill-actions.ts"
import { loadBill } from "@/core/modules/bill/bill-guards.ts"
import { BillId } from "@/core/modules/bill/bill-types.ts"
import { loadCalculatedBillLineSummaries } from "@/core/modules/bill-line/bill-line-actions.ts"
import { latestPaymentsQuery } from "@/core/modules/payment/payment-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export interface AiModelDep {
  readonly aiModel: LanguageModel
}

/** The model endpoint failed: unreachable, rejected the key, or broke off. */
const createAiRequestError = defineError("AiRequestError")<{
  readonly error: unknown
}>()
export type AiRequestError = ReturnType<typeof createAiRequestError>

const maxSteps = 10

const systemPrompt = `You are the assistant inside Payky, a point-of-sale app for merchants that takes Bitcoin (Lightning), bank transfer, card and cash payments.
Answer the merchant's question. Use the data tools to look at their bills and payments, and the documentation and source code tools, when you have them, to explain how Payky behaves.
Money amounts in the data are integer minor units of the row's currency (cents for fiat, sats for bitcoin).
If the code suggests a bug, say it only looks like one, and name the file and line that makes you think so.
Reply in the language of the question. Keep the answer short and readable for a merchant, not a developer.`

/** Read-only tools over the merchant's local Evolu data. */
const createDataTools = (run: Run<EvoluDep>) => ({
  listOpenBills: tool({
    description: "List open bills with their items.",
    inputSchema: z.object({}),
    execute: () => run.ok(listOpenBills()),
  }),
  getBill: tool({
    description: "Show one bill and its lines by id.",
    // Branded ids have no JSON Schema form, so the model sends a plain string.
    inputSchema: z.object({ id: z.string() }),
    execute: async (input) => {
      const parsed = BillId.safeParse(input.id)
      if (!parsed.success) return { error: "Not a bill id" }
      const id = parsed.data
      const bill = await run(loadBill(id))
      if (!bill.ok) return { error: "Bill not found" }
      return {
        bill: bill.value,
        lines: await run.ok(loadCalculatedBillLineSummaries(id)),
      }
    },
  }),
  latestPayments: tool({
    description: "List the most recent payments, newest first.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50) }),
    execute: ({ limit }) =>
      run.deps.evolu.loadQuery(latestPaymentsQuery(limit)),
  }),
})

/**
 * Answers one prompt with the model from `AiModelDep`, streaming the reply
 * through `onText`, and resolves to the full reply. Text already streamed
 * stays streamed when the request then fails with `AiRequestError`.
 *
 * `tools` adds the runtime-specific tools (documentation, source code) on top
 * of the data tools, which read the local Evolu database and work anywhere.
 */
export const askAssistant =
  ({
    prompt,
    tools,
    onText,
  }: {
    readonly prompt: string
    readonly tools: ToolSet
    readonly onText: (text: string) => void
  }): Task<string, AiRequestError, AiModelDep & EvoluDep & ConsoleDep> =>
  async (run) => {
    let streamError: unknown = null
    const result = streamText({
      model: run.deps.aiModel,
      system: systemPrompt,
      prompt,
      tools: { ...createDataTools(run), ...tools },
      stopWhen: isStepCount(maxSteps),
      onToolExecutionStart: ({ toolCall }) => {
        run.deps.console.debug(
          `[ai] ${toolCall.toolName} ${JSON.stringify(toolCall.input)}`
        )
      },
      onError: ({ error }) => {
        streamError = error
      },
    })

    let reply = ""
    for await (const text of result.textStream) {
      reply += text
      onText(text)
    }
    if (streamError !== null) {
      return err(createAiRequestError({ error: streamError }))
    }

    return ok(reply)
  }
