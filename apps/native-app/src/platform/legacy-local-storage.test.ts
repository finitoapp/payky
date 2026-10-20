import { expect, test } from "vitest"
import { legacyLocalStorage } from "./legacy-local-storage.ts"

test("reports no legacy value and ignores removal", () => {
  expect(legacyLocalStorage.getItem("anything")).toBeNull()
  expect(legacyLocalStorage.removeItem("anything")).toBeUndefined()
  expect(legacyLocalStorage.getItem("anything")).toBeNull()
})
