import { describe, expect, test } from "vitest"
import { decisionAiTools } from "./decision-ai-tools.ts"

const options = { toolCallId: "call-1", messages: [], context: {} }
const proxyDecision =
  "docs/decisions/ai/0001-the-assistant-talks-to-payky-s-own-proxy.md"

describe("decisionAiTools", () => {
  test("lists the bundled decisions under a prefix", async () => {
    const list = await decisionAiTools.listDecisions.execute?.(
      { prefix: "docs/decisions/ai/" },
      options
    )
    expect(list).toContain(proxyDecision)
    expect(list).not.toContain("docs/decisions/payment/")
  })

  test("reads a decision with line numbers", async () => {
    expect(
      await decisionAiTools.readDecision.execute?.(
        { path: proxyDecision, fromLine: 3, toLine: 3 },
        options
      )
    ).toBe("3: Status: accepted")
  })

  test("refuses a path that is not a decision", async () => {
    for (const path of ["package.json", ".env", "AGENTS.md"]) {
      expect(
        await decisionAiTools.readDecision.execute?.({ path }, options)
      ).toEqual({ error: `Not a decision: ${path}` })
    }
  })

  test("searches the decisions case-insensitively", async () => {
    expect(
      await decisionAiTools.searchDecisions.execute?.(
        { pattern: "trusts EVERY owner id", prefix: "docs/decisions/ai/" },
        options
      )
    ).toBe(
      `${proxyDecision}:1:# 0001 The assistant talks to Payky's own proxy, which trusts every owner id`
    )
  })

  test("reports a search without matches and an invalid pattern", async () => {
    expect(
      await decisionAiTools.searchDecisions.execute?.(
        { pattern: "no-such-text-[0-9]{40}" },
        options
      )
    ).toBe("No matches.")
    expect(
      await decisionAiTools.searchDecisions.execute?.({ pattern: "(" }, options)
    ).toHaveProperty("error")
  })
})
