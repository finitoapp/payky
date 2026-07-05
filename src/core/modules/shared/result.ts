import { err, ok, type Result } from "@evolu/common"

export const getFirstOr = <T, E>(
  rows: ReadonlyArray<T>,
  error: E
): Result<T, E> => {
  const row = rows[0]
  return row === null || row === undefined ? err(error) : ok(row)
}
