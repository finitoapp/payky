import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createEvoluTest } from "../testing/evolu.ts"
import { createDataTools } from "./assistant.ts"
import { createAssistantTools } from "./assistant-tools.ts"

const snapshot = {
  snapshotUrl: "https://payky.me/repo-snapshot.json",
  appVersion: "abc1234",
}

describe("createAssistantTools", () => {
  test("leaves the data tools out unless the merchant allowed their data", async () => {
    await using testEvolu = await createEvoluTest()
    await using run = testCreateRun({ evolu: testEvolu.evolu, fetch })
    const dataToolNames = Object.keys(createDataTools(run))
    const publicTools = createAssistantTools("public", run, snapshot)
    const repoToolNames = Object.keys(publicTools.repoTools)

    expect(Object.keys(publicTools.tools)).toEqual(repoToolNames)
    expect(
      Object.keys(createAssistantTools("all", run, snapshot).tools)
    ).toEqual([...dataToolNames, ...repoToolNames])
  })
})
