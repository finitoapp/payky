import type { StandardSchemaV1 } from "@standard-schema/spec"
import { z } from "zod"

type InferStandardInput<TSchema extends StandardSchemaV1> =
  StandardSchemaV1.InferInput<TSchema>

type InferStandardOutput<TSchema extends StandardSchemaV1> =
  StandardSchemaV1.InferOutput<TSchema>

const pathToZodPath = (
  path: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment> | undefined
): PropertyKey[] => {
  if (!path) return []

  return path.map((segment) => {
    if (typeof segment === "object" && segment !== null && "key" in segment) {
      return segment.key
    }

    return segment
  })
}

export const standardSchemaToZod = <TSchema extends StandardSchemaV1>(
  schema: TSchema
): z.ZodType<InferStandardOutput<TSchema>, InferStandardInput<TSchema>> => {
  return z
    .custom<InferStandardInput<TSchema>>()
    .transform((value, ctx): InferStandardOutput<TSchema> => {
      const result = schema["~standard"].validate(value)
      if (result instanceof Promise)
        throw new Error(
          `Only synchronous validation is supported for standard schemas.`
        )

      if (result.issues) {
        for (const issue of result.issues) {
          ctx.issues.push({
            code: "custom",
            message: issue.message,
            path: pathToZodPath(issue.path),
            input: value,
          })
        }

        return z.NEVER
      }

      return result.value
    }) as z.ZodType<InferStandardOutput<TSchema>, InferStandardInput<TSchema>>
}
