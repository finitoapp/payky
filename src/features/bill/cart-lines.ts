import type { BillLineRow } from "@/core/modules/bill-line/bill-line.ts"

export type CartLine = Omit<BillLineRow, "id">

/**
 * Undoing/redoing a bill-line append is always just re-appending the same
 * line with its `kind` flipped — the append-only ledger design makes this
 * exact and needs no separate undo table.
 */
export const invertLine = (line: CartLine): CartLine => ({
  ...line,
  kind: line.kind === "add" ? "remove" : "add",
})

/**
 * Whether writing `lines` takes `discard` (access/0002): any batch with a
 * `remove` line lowers the bill's total, whichever cart operation writes it —
 * removing a line, clearing, or undoing an added line.
 */
export const linesNeedDiscard = (
  lines: ReadonlyArray<Pick<CartLine, "kind">>
): boolean => lines.some((line) => line.kind === "remove")
