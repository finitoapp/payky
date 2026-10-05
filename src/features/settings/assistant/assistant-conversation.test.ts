import { describe, expect, test } from "vitest"

import {
  type AssistantTurn,
  toAssistantMessages,
} from "./assistant-conversation.ts"

const turn = (overrides: Partial<AssistantTurn>): AssistantTurn => ({
  id: "1",
  question: "Which bills are open?",
  reply: "Two.",
  status: "answered",
  ...overrides,
})

describe("toAssistantMessages", () => {
  test("sends the earlier questions and replies, then the new question", () => {
    expect(
      toAssistantMessages(
        [
          turn({}),
          turn({ question: "Stop?", reply: "Partly", status: "stopped" }),
        ],
        "And payments?"
      )
    ).toEqual([
      { role: "user", content: "Which bills are open?" },
      { role: "assistant", content: "Two." },
      { role: "user", content: "Stop?" },
      { role: "assistant", content: "Partly" },
      { role: "user", content: "And payments?" },
    ])
  })

  test("leaves out a turn that failed or was stopped before any reply", () => {
    expect(
      toAssistantMessages(
        [
          turn({ reply: "", status: "failed" }),
          turn({ reply: "", status: "stopped" }),
        ],
        "Hi"
      )
    ).toEqual([{ role: "user", content: "Hi" }])
  })
})
