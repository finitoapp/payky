export type ItemGridRow<Item, Group> =
  | { readonly type: "heading"; readonly key: string; readonly group: Group }
  | {
      readonly type: "items"
      readonly key: string
      readonly items: ReadonlyArray<Item>
    }

/**
 * The bill grid's two-column rows, as web's CSS grid lays them out: with
 * headings on, each group starts with a full-width heading row and its
 * items on a fresh row, so a group's odd last item leaves the cell beside
 * it empty. `items` arrive sorted by group, as the grouped query returns
 * them.
 */
export function buildItemGridRows<Item extends { readonly id: string }, Group>(
  items: ReadonlyArray<Item>,
  groupOf: (item: Item) => Group,
  showHeadings: boolean
): ReadonlyArray<ItemGridRow<Item, Group>> {
  const rows: Array<ItemGridRow<Item, Group>> = []
  let pending: Item[] = []
  const flush = () => {
    const [first] = pending
    if (first !== undefined)
      rows.push({ type: "items", key: first.id, items: pending })
    pending = []
  }
  items.forEach((item, index) => {
    const previous = items[index - 1]
    const group = groupOf(item)
    if (
      showHeadings &&
      (previous === undefined || groupOf(previous) !== group)
    ) {
      flush()
      rows.push({ type: "heading", key: `heading:${item.id}`, group })
    }
    pending.push(item)
    if (pending.length === 2) flush()
  })
  flush()
  return rows
}
