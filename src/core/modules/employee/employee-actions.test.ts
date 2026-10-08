import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import {
  createEmployee,
  deleteEmployee,
  renameEmployee,
} from "./employee-actions.ts"
import { activeEmployeesQuery } from "./employee-queries.ts"

describe("employee actions", () => {
  test("adds, renames and removes an employee", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    })

    const id = await run.ok(createEmployee({ name: NonEmptyString255("Ana") }))
    await run.ok(renameEmployee({ id, name: NonEmptyString255("Anna") }))
    expect(await evolu.loadQuery(activeEmployeesQuery)).toEqual([
      { id, name: "Anna" },
    ])

    await run.ok(deleteEmployee(id))
    expect(await evolu.loadQuery(activeEmployeesQuery)).toEqual([])
  })
})
