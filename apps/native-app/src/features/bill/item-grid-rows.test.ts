import { expect, test } from "vitest"
import { buildItemGridRows, type ItemGridRow } from "./item-grid-rows.ts"

const items = [
  { id: "a", group: "drinks" },
  { id: "b", group: "drinks" },
  { id: "c", group: "drinks" },
  { id: "d", group: null },
]

const shape = (
  rows: ReadonlyArray<ItemGridRow<{ readonly id: string }, string | null>>
) =>
  rows.map((row) =>
    row.type === "heading"
      ? `# ${String(row.group)}`
      : row.items.map((item) => item.id).join("")
  )

test("pairs items two per row, starting each group on a new row under its heading", () => {
  expect(shape(buildItemGridRows(items, (item) => item.group, true))).toEqual([
    "# drinks",
    "ab",
    "c",
    "# null",
    "d",
  ])
})

test("without headings, pairs straight through the groups", () => {
  expect(shape(buildItemGridRows(items, (item) => item.group, false))).toEqual([
    "ab",
    "cd",
  ])
  expect(buildItemGridRows(items.slice(0, 0), () => null, true)).toEqual([])
})
