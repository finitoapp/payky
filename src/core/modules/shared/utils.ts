import {
  type Brand,
  createId,
  createRandomBytes,
  type Id,
  type MutationOptions,
  type TypeName,
} from "@evolu/common"
import type { ConditionalExcept } from "type-fest"
import {
  NonNegativeInteger,
  type NonNegativeInteger as NonNegativeIntegerType,
} from "@/core/modules/shared/schema.ts"

interface MutationCompletion {
  readonly options: MutationOptions
  readonly promise: Promise<void>
}

const createMutationCompletion = (): MutationCompletion => {
  const completed = Promise.withResolvers<void>()

  return {
    options: {
      onComplete: completed.resolve,
    },
    promise: completed.promise,
  }
}

/**
 * Runs `mutate` as one Evolu mutation batch and resolves once that batch has
 * actually been applied, so follow-up work can read the written rows back.
 *
 * `mutate` must perform at least one mutation: the `onComplete` it is handed
 * is only ever invoked by Evolu applying a mutation, so a callback that ends
 * up writing nothing leaves the returned promise pending forever. Callers
 * whose batch can legitimately be empty must skip it themselves — see
 * `appendBillLines` and `splitBill`.
 */
export const runMutationWithCompletion = async <TResult>(
  mutate: (options: MutationOptions) => TResult
): Promise<TResult> => {
  const completed = createMutationCompletion()
  const result = mutate(completed.options)

  await completed.promise

  return result
}

export const removeUndefinedValues = <const TData extends object>(
  data: { [key in keyof TData]: TData[key] | undefined }
): ConditionalExcept<TData, undefined> => {
  const values = { ...data } as Record<string, unknown>
  for (const key of Object.keys(values)) {
    if (values[key] === undefined) {
      delete values[key]
    }
  }
  return values as ConditionalExcept<TData, undefined>
}

/**
 * Derives the `sortOrder` for a row appended after the current last one, for
 * modules with no reorder UI yet (catalog items, catalog categories, tables,
 * tax rates). Rows are expected sorted by `sortOrder` ascending, as the
 * `*Query`s these callers load already do via their `sortOrder` index.
 */
export const getNextSortOrder = (
  existing: ReadonlyArray<{ readonly sortOrder: NonNegativeIntegerType }>
): NonNegativeIntegerType =>
  NonNegativeInteger((existing.at(-1)?.sortOrder ?? -1) + 1)

const randomBytes = createRandomBytes()

export const createTableId = <Table extends TypeName>(): Id & Brand<Table> =>
  createId<never>({ randomBytes }) as Id & Brand<Table>

/**
 * A Spark money movement's base row plus its optional Lightning invoice
 * and/or Spark invoice detail, shared by payment and account-transaction
 * insert/update input types.
 */
export type WithSparkDetails<TBase, TLightning, TSparkInvoice> = TBase & {
  readonly lightning?: TLightning
  readonly sparkInvoice?: TSparkInvoice
}

const hasSparkIdentifier = (
  detail: WithSparkDetails<unknown, object, object>
): boolean =>
  detail.lightning !== undefined || detail.sparkInvoice !== undefined

/**
 * Throws `message` unless `detail` is absent or has a Spark identifier.
 * Shared by insert actions that accept optional Spark details.
 */
export const assertHasSparkIdentifier = (
  detail: WithSparkDetails<unknown, object, object> | undefined,
  message: string
): void => {
  if (detail && !hasSparkIdentifier(detail)) {
    throw new Error(message)
  }
}
