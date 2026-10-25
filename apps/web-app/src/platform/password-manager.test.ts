import { describe, expect, test, vi } from "vitest"
import { triggerPasswordManagerSeedSave } from "./password-manager.ts"

const input = { accountId: "abc", accountName: "Café", mnemonic: "one two" }

describe("triggerPasswordManagerSeedSave", () => {
  test("stores the phrase as the password of payky.seed:<accountId>", async () => {
    const store = vi.fn().mockResolvedValue(undefined)
    const PasswordCredential = vi.fn(function (this: object, init: object) {
      Object.assign(this, init)
    }) as unknown as new (init: {
      id: string
      name: string
      password: string
    }) => Credential

    const result = await triggerPasswordManagerSeedSave(input, {
      credentials: { store },
      PasswordCredential,
    })

    expect(result).toBe("saved")
    expect(store).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "payky.seed:abc",
        name: "Café",
        password: "one two",
      })
    )
  })

  test("is unsupported without the Credential Management API", async () => {
    expect(await triggerPasswordManagerSeedSave(input, {})).toBe("unsupported")
  })

  test("reports a rejected store as failed", async () => {
    const result = await triggerPasswordManagerSeedSave(input, {
      credentials: { store: () => Promise.reject(new Error("denied")) },
      PasswordCredential: class {} as never,
    })
    expect(result).toBe("failed")
  })
})
