export interface DayGroup<T> {
  readonly date: Date
  readonly items: ReadonlyArray<T>
}

/**
 * Splits `items` into consecutive runs sharing the same local calendar day,
 * preserving input order within and across groups. Doesn't sort — callers
 * order their own query (e.g. `createdAt` desc) and this just chunks that
 * order by day, so out-of-order input would produce more, smaller groups
 * instead of merging same-day items that aren't adjacent.
 */
export function groupByDay<T>(
  items: ReadonlyArray<T>,
  getDate: (item: T) => Date
): ReadonlyArray<DayGroup<T>> {
  const groups: Array<{ date: Date; items: T[] }> = []

  for (const item of items) {
    const date = getDate(item)
    const lastGroup = groups[groups.length - 1]
    const isSameDay =
      lastGroup !== undefined &&
      lastGroup.date.getFullYear() === date.getFullYear() &&
      lastGroup.date.getMonth() === date.getMonth() &&
      lastGroup.date.getDate() === date.getDate()

    if (lastGroup !== undefined && isSameDay) {
      lastGroup.items.push(item)
    } else {
      groups.push({ date, items: [item] })
    }
  }

  return groups
}
