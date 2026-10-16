import { idToIdBytes, kyselySql, ownerIdToOwnerIdBytes } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { runMutationWithCompletion } from "../modules/shared/evolu-utils.ts"
import {
  NonEmptyString255,
  NonNegativeInteger,
  PositiveInteger,
} from "../modules/shared/schema.ts"
import { createEvoluTest } from "../testing/evolu.ts"
import { createQuery } from "./schema.ts"

/**
 * `evolu_history` is Evolu's internal table, and Payky reads it twice for the
 * shared Cashu wallet (cashu.md): the shard rotation measures an owner's
 * history in it, and the booking cursor follows its `rowid`. Its shape may
 * change with an Evolu upgrade; this fails first when it does.
 */
describe("evolu_history shape", () => {
  test("has the columns, the rowid and the binary owner and id the Cashu code reads", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const id = await runMutationWithCompletion(
      (options) =>
        evolu.insert(
          "table",
          {
            name: NonEmptyString255("A"),
            code: NonEmptyString255("A"),
            seatCount: PositiveInteger(4),
            sortOrder: NonNegativeInteger(0),
          },
          options
        ).id
    )

    const columns = await evolu.loadQuery(
      createQuery((db) =>
        db
          .selectFrom(
            kyselySql<{
              name: string
            }>`(select "name" from pragma_table_info('evolu_history'))`.as(
              "info"
            )
          )
          .select("info.name")
      )
    )
    expect(columns.map((column) => column.name).sort()).toEqual(
      ["column", "id", "ownerId", "table", "timestamp", "value"].sort()
    )

    const rows = await evolu.loadQuery(
      createQuery((db) =>
        db
          .selectFrom(
            kyselySql<{
              rowid: number
              table: string
              column: string
              ownerIdHex: string
              idHex: string
            }>`(select "rowid", "table", "column", hex("ownerId") as "ownerIdHex", hex("id") as "idHex" from "evolu_history" where "ownerId" = ${ownerIdToOwnerIdBytes(evolu.appOwner.id)})`.as(
              "history"
            )
          )
          .selectAll()
      )
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.table === "table")).toBe(true)
    expect(rows.every((row) => typeof row.rowid === "number")).toBe(true)
    expect(rows.map((row) => row.column)).toContain("name")
    expect(rows[0]?.ownerIdHex).toBe(
      Buffer.from(ownerIdToOwnerIdBytes(evolu.appOwner.id))
        .toString("hex")
        .toUpperCase()
    )
    expect(rows[0]?.idHex).toBe(
      Buffer.from(idToIdBytes(id)).toString("hex").toUpperCase()
    )
  })
})
