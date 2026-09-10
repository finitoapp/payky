import { sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  cancelBill,
  createBillAtEnd,
} from "@/core/modules/bill/bill-actions.ts"
import { createRandomBillId } from "@/core/modules/bill/bill-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  createTable,
  createTableAtEnd,
  deleteTable,
  listTables,
  updateTable,
} from "./table-actions.ts"
import type { TableId } from "./table-types.ts"

const createDateDeps = (): DateDep => ({
  date: {
    now: () => new Date("2026-06-05T12:00:00.000Z"),
  },
})

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
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const id = await run.ok(
      createTable({
        deviceId: null,
        name: NonEmptyString255("Main room"),
        seatCount: PositiveInteger(4),
        code: NonEmptyString255("ABCD1234"),
        sortOrder: NonNegativeInteger(10),
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
      await run.ok(
        updateTable({
          id,
          name: NonEmptyString255("Patio"),
          sortOrder: NonNegativeInteger(20),
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
      await run.ok(
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

  test("refuses to delete a table while an open bill sits on it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDeps(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)

    const tableId = await run.ok(
      createTable({
        deviceId: null,
        name: NonEmptyString255("Terrace"),
        seatCount: PositiveInteger(2),
        code: NonEmptyString255("TERRACE1"),
        sortOrder: NonNegativeInteger(10),
      })
    )
    const billId = await run.ok(
      createBillAtEnd({
        id: createRandomBillId(),
        deviceId: null,
        label: null,
        tableId,
        currency: "CZK",
      })
    )

    // The POS floor view renders non-deleted tables plus the bills with no
    // table at all, so deleting an occupied table would leave this bill with
    // no tile to reach it from.
    await expect(run(deleteTable(tableId))).resolves.toEqual({
      ok: false,
      error: { type: "TableHasOpenBills", id: tableId, openBillCount: 1 },
    })

    await run.orThrow(cancelBill(billId))

    await expect(run(deleteTable(tableId))).resolves.toEqual({
      ok: true,
      value: tableId,
    })
  }, 15_000)

  test("lists only active complete tables ordered by sort order", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const secondId = await run.ok(
      createTable({
        deviceId: null,
        name: NonEmptyString255("Second"),
        seatCount: PositiveInteger(2),
        code: NonEmptyString255("SECOND01"),
        sortOrder: NonNegativeInteger(20),
      })
    )
    const firstId = await run.ok(
      createTable({
        deviceId: null,
        name: NonEmptyString255("First"),
        seatCount: PositiveInteger(2),
        code: NonEmptyString255("FIRST001"),
        sortOrder: NonNegativeInteger(10),
      })
    )
    const deletedId = await run.ok(
      createTable({
        deviceId: null,
        name: NonEmptyString255("Deleted"),
        seatCount: PositiveInteger(2),
        code: NonEmptyString255("DELETED1"),
        sortOrder: NonNegativeInteger(5),
      })
    )
    await run.orThrow(deleteTable(deletedId))

    await expect
      .poll(() => run.ok(listTables()))
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

  test("appends tables with an increasing sortOrder and a generated code", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      evolu,
      evoluOwnerId: evolu.appOwner.id,
    } satisfies EvoluDep & EvoluOwnerIdDep
    await using run = testCreateRun(deps)

    const firstId = await run.ok(
      createTableAtEnd({
        deviceId: null,
        name: NonEmptyString255("First"),
        seatCount: PositiveInteger(2),
      })
    )
    const secondId = await run.ok(
      createTableAtEnd({
        deviceId: null,
        name: NonEmptyString255("Second"),
        seatCount: PositiveInteger(4),
      })
    )

    await expect
      .poll(() => run.ok(listTables()))
      .toMatchObject([
        { id: firstId, sortOrder: 0 },
        { id: secondId, sortOrder: 1 },
      ])

    const [first, second] = await run.ok(listTables())
    expect(first?.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/)
    expect(second?.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/)
    expect(first?.code).not.toBe(second?.code)
  }, 15_000)
})
