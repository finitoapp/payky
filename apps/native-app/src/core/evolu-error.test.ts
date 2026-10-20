import type { EvoluError } from "@evolu/common/local-first"
import { expect, test } from "vitest"
import { evoluErrorToError } from "./evolu-error.ts"

test("names the Evolu error and carries an UnknownError's message", () => {
  const unknown = {
    type: "UnknownError",
    error: { message: 'dlopen failed: cannot locate symbol "EVP_MAC_fetch"' },
  } as EvoluError
  const error = evoluErrorToError(unknown)
  expect(error.name).toBe("EvoluError")
  expect(error.message).toBe(
    'UnknownError: dlopen failed: cannot locate symbol "EVP_MAC_fetch"'
  )

  expect(
    evoluErrorToError({ type: "DatabaseHeldError" } as EvoluError).message
  ).toBe("DatabaseHeldError")
})
