import { sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createQuery } from "@/core/evolu/schema.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  createTable,
  deleteTable,
  listTables,
  updateTable,
} from "./table-actions.ts"
import type { TableId } from "./table-types.ts"

const tableRecordByIdQuery = (id: TableId) =>
  createQuery((db) =>
    db
      .selectFrom("table")
      .select(["id", "deviceId", "name", "sortOrder", "isDeleted"])
      .where("id", "=", id)
  )

describe("table actions", () => {
  test("creates, updates, and soft deletes a table through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const id = await run.orThrow(
      createTable({
        deviceId: null,
        name: "Main room",
        sortOrder: 10,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(tableRecordByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          name: "Main room",
          sortOrder: 10,
          isDeleted: null,
        },
      ])

    expect(
      await run.orThrow(
        updateTable({
          id,
          name: "Patio",
          sortOrder: 20,
        })
      )
    ).toBe(id)

    await expect
      .poll(() => evolu.loadQuery(tableRecordByIdQuery(id)))
      .toMatchObject([
        {
          id,
          name: "Patio",
          sortOrder: 20,
          isDeleted: null,
        },
      ])

    expect(
      await run.orThrow(
        updateTable({
          id,
          name: undefined,
          sortOrder: undefined,
        })
      )
    ).toBe(id)

    await expect
      .poll(() => evolu.loadQuery(tableRecordByIdQuery(id)))
      .toMatchObject([
        {
          id,
          name: "Patio",
          sortOrder: 20,
          isDeleted: null,
        },
      ])

    expect(await run.orThrow(deleteTable(id))).toBe(id)

    await expect
      .poll(() => evolu.loadQuery(tableRecordByIdQuery(id)))
      .toMatchObject([
        {
          id,
          name: "Patio",
          sortOrder: 20,
          isDeleted: sqliteTrue,
        },
      ])
  }, 15_000)

  test("lists only active complete tables ordered by sort order", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const secondId = await run.orThrow(
      createTable({
        deviceId: null,
        name: "Second",
        sortOrder: 20,
      })
    )
    const firstId = await run.orThrow(
      createTable({
        deviceId: null,
        name: "First",
        sortOrder: 10,
      })
    )
    const deletedId = await run.orThrow(
      createTable({
        deviceId: null,
        name: "Deleted",
        sortOrder: 5,
      })
    )
    await run.orThrow(deleteTable(deletedId))

    await expect
      .poll(() => run.orThrow(listTables()))
      .toMatchObject([
        {
          id: firstId,
          name: "First",
          sortOrder: 10,
          isDeleted: null,
        },
        {
          id: secondId,
          name: "Second",
          sortOrder: 20,
          isDeleted: null,
        },
      ])
  }, 15_000)
})
