import { err, ok, type Result } from "@evolu/common"

export type ActionError =
  | {
      readonly type: "NotFound"
      readonly entity: string
      readonly id: string
    }
  | {
      readonly type: "InvalidOperation"
      readonly message: string
    }

export const notFound = (entity: string, idValue: string): ActionError => ({
  type: "NotFound",
  entity,
  id: idValue,
})

export const invalidOperation = (message: string): ActionError => ({
  type: "InvalidOperation",
  message,
})

export const getFirst = <T>(
  rows: ReadonlyArray<T>,
  entity: string,
  idValue: string
): Result<T, ActionError> => {
  const row = rows[0]
  return row == null ? err(notFound(entity, idValue)) : ok(row)
}
