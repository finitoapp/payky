type NullableKeys<T> = {
  [K in keyof T]-?: null extends T[K] ? K : never
}[keyof T]

type NonNullableKeys<T> = {
  [K in keyof T]-?: null extends T[K] ? never : K
}[keyof T]

export type NullableFieldsToOptional<T extends Record<string, unknown>> =
  // Non-nullable fields stay required.
  {
    [K in NonNullableKeys<T>]: T[K]
  } & {
    // Nullable fields become optional.
    [K in NullableKeys<T>]?: T[K]
  }
