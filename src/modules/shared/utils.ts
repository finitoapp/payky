import type { MutationOptions } from "@evolu/common"
import type { ConditionalExcept } from "type-fest"

export interface MutationCompletion {
  readonly options: MutationOptions
  readonly promise: Promise<void>
}

export const createMutationCompletion = (): MutationCompletion => {
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
  data: TData
): ConditionalExcept<TData, undefined> => {
  const values = { ...data } as Record<string, unknown>
  for (const key of Object.keys(values)) {
    if (values[key] === undefined) {
      delete values[key]
    }
  }
  return values as ConditionalExcept<TData, undefined>
}
