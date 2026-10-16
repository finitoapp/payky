import { err, ok } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { getFirstOr } from "./result.ts"

describe("getFirstOr", () => {
  test("returns ok with the first row when rows are present", () => {
    expect(getFirstOr(["first", "second"], "not found")).toEqual(ok("first"))
  })

  test("returns err with the given error when rows are empty", () => {
    expect(getFirstOr([], "not found")).toEqual(err("not found"))
  })
})
