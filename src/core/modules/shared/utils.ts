import {
  type Brand,
  createId,
  createRandomBytes,
  type Id,
  type MutationOptions,
  type TypeName,
} from "@evolu/common"
import type { ConditionalExcept } from "type-fest"

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

export const hasSparkIdentifier = (
  detail: WithSparkDetails<unknown, object, object>
): boolean =>
  detail.lightning !== undefined || detail.sparkInvoice !== undefined
