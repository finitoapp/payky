import { createIdFromString, id } from "@evolu/common"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import { describe, expect, test } from "vitest"

import { standardSchemaToZod } from "./zod-utils.ts"

describe("standardSchemaToZod", () => {
  test("passes through a value the standard schema accepts", () => {
    const schema = standardSchemaToZod(id("Bill"))
    const validId = createIdFromString("payky-test-bill")

    expect(schema.parse(validId)).toBe(validId)
  })

  test("reports the standard schema's issue message on rejection", () => {
    const schema = standardSchemaToZod(id("Bill"))
    const result = schema.safeParse("not-an-id")

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'The value "not-an-id" is not a valid Id for table Bill.'
    )
  })

  test("maps standard schema path segments, including object {key} segments", () => {
    const fakeSchema: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => ({
          issues: [
            { message: "plain segment", path: ["field"] },
            { message: "object segment", path: [{ key: "nested" }] },
          ],
        }),
      },
    }

    const result = standardSchemaToZod(fakeSchema).safeParse("value")

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["field"],
      ["nested"],
    ])
  })

  test("throws when the standard schema validates asynchronously", () => {
    const asyncSchema: StandardSchemaV1<unknown, unknown> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => Promise.resolve({ value: "value" }),
      },
    }

    expect(() => standardSchemaToZod(asyncSchema).parse("value")).toThrow(
      "Only synchronous validation is supported for standard schemas."
    )
  })
})
