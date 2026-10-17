import { expect, test } from "vitest"
import { noLegacyLocalStorage } from "./no-legacy-local-storage.ts"

test("reports no legacy value and ignores removal", () => {
  expect(noLegacyLocalStorage.getItem("anything")).toBeNull()
  expect(noLegacyLocalStorage.removeItem("anything")).toBeUndefined()
  expect(noLegacyLocalStorage.getItem("anything")).toBeNull()
})
