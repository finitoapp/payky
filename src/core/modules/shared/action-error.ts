import { err, ok, type Result } from "@evolu/common"

import { defineError } from "@/core/error.ts"

const createNotFoundError = defineError("NotFound")<{
  readonly entity: string
  readonly id: string
}>()
export type NotFoundError = ReturnType<typeof createNotFoundError>

const createInvalidOperationError = defineError("InvalidOperation")<{
  readonly message: string
}>()
export type InvalidOperationError = ReturnType<
  typeof createInvalidOperationError
>

export type ActionError = NotFoundError | InvalidOperationError

export const notFound = (entity: string, idValue: string): NotFoundError =>
  createNotFoundError({
    entity,
    id: idValue,
  })

export const invalidOperation = (message: string): InvalidOperationError =>
  createInvalidOperationError({
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
