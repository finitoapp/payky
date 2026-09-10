import { beforeEach, describe, expect, test, vi } from "vitest"

import { copyToClipboard } from "@/lib/clipboard.ts"

const { success, error } = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success, error } }))

const messages = { copied: "Copied.", failed: "Could not copy." }

const stubClipboard = (writeText: () => Promise<void>) => {
  vi.stubGlobal("navigator", { clipboard: { writeText } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("copyToClipboard", () => {
  test("writes the value and reports success", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard(writeText)

    await copyToClipboard("bc1qexample", messages)

    expect(writeText).toHaveBeenCalledWith("bc1qexample")
    expect(success).toHaveBeenCalledWith(messages.copied)
    expect(error).not.toHaveBeenCalled()
  })

  test("reports failure instead of rejecting when the write is refused", async () => {
    stubClipboard(() => Promise.reject(new Error("NotAllowedError")))

    await expect(
      copyToClipboard("bc1qexample", messages)
    ).resolves.toBeUndefined()

    expect(error).toHaveBeenCalledWith(messages.failed)
    expect(success).not.toHaveBeenCalled()
  })
})
