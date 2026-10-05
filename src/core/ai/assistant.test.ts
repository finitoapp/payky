import { createConsole, testCreateRun } from "@evolu/common"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { describe, expect, test } from "vitest"
import { createBill } from "@/core/modules/bill/bill-actions.ts"
import {
  NonEmptyString255,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "../evolu/cli-client"
import { askAssistant } from "./assistant.ts"

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

describe("askAssistant", () => {
  test("runs a data tool locally and hands its result back to the model", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const aiModel = new MockLanguageModelV4({
      doStream: [
        {
          stream: simulateReadableStream({
            chunks: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "listOpenBills",
                input: "{}",
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage,
              },
            ],
          }),
        },
        {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "text-1" },
              { type: "text-delta", id: "text-1", delta: "One open bill." },
              { type: "text-end", id: "text-1" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage,
              },
            ],
          }),
        },
      ],
    })
    await using run = testCreateRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      console: createConsole(),
      aiModel,
    })
    await run.ok(
      createBill({
        deviceId: null,
        displayNumber: PositiveInteger(1),
        label: NonEmptyString255("Dinner"),
        tableId: null,
        currency: "CZK",
      })
    )

    const streamed: string[] = []
    const reply = await run.orThrow(
      askAssistant({
        prompt: "What is open?",
        tools: {},
        onText: (text) => streamed.push(text),
      })
    )

    expect(reply).toBe("One open bill.")
    expect(streamed.join("")).toBe(reply)
    expect(JSON.stringify(aiModel.doStreamCalls[1]?.prompt)).toContain("Dinner")
  })

  test("returns AiRequestError when the model endpoint fails", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      console: createConsole(),
      aiModel: new MockLanguageModelV4({
        doStream: () => Promise.reject(new Error("connection refused")),
      }),
    })

    const result = await run(
      askAssistant({ prompt: "Hi", tools: {}, onText: () => undefined })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "AiRequestError" },
    })
  })
})
