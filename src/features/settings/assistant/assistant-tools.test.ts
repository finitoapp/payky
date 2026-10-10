import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createDataTools } from "@/core/ai/assistant.ts"
import { createEvoluTest } from "@/test/evolu.ts"
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
