import { testCreateRun } from "@evolu/common"
import { createDataTools } from "@payky/core/ai/assistant"
import { createEvoluTest } from "@payky/core/testing/evolu"
import { describe, expect, test } from "vitest"
import { createAssistantTools } from "./assistant-tools.ts"

describe("createAssistantTools", () => {
  test("leaves the data tools out unless the merchant allowed their data", async () => {
    await using testEvolu = await createEvoluTest()
    await using run = testCreateRun({ evolu: testEvolu.evolu, fetch })
    const dataToolNames = Object.keys(createDataTools(run))
    const publicTools = createAssistantTools("public", run)
    const repoToolNames = Object.keys(publicTools.repoTools)

    expect(Object.keys(publicTools.tools)).toEqual(repoToolNames)
    expect(Object.keys(createAssistantTools("all", run).tools)).toEqual([
      ...dataToolNames,
      ...repoToolNames,
    ])
  })
})
