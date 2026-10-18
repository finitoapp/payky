import { describe, expect, it } from "vitest"
import {
  type EvoluExportShareIo,
  shareEvoluExport,
} from "./evolu-export-share.ts"

const makeIo = (overrides: Partial<EvoluExportShareIo> = {}) => {
  const calls: string[] = []
  const io: EvoluExportShareIo = {
    isSharingAvailable: async () => {
      calls.push("available")
      return true
    },
    writeTemp: async ({ folder }) => {
      calls.push("write")
      return `file:///cache/${folder}/x.sqlite`
    },
    share: async () => {
      calls.push("share")
    },
    removeTemp: () => {
      calls.push("remove")
    },
    ...overrides,
  }
  return { io, calls }
}

const input = { bytes: new Uint8Array([1]), filename: "x.sqlite", folder: "f" }

describe("shareEvoluExport", () => {
  it("writes, shares, then removes the temp folder", async () => {
    const { io, calls } = makeIo()
    await expect(shareEvoluExport({ io, ...input })).resolves.toBe("shared")
    expect(calls).toEqual(["available", "write", "share", "remove"])
  })

  it("writes nothing when sharing is unavailable", async () => {
    const { io, calls } = makeIo({ isSharingAvailable: async () => false })
    await expect(shareEvoluExport({ io, ...input })).resolves.toBe(
      "unavailable"
    )
    expect(calls).toEqual([])
  })

  it("removes the temp folder when the share fails", async () => {
    const { io, calls } = makeIo({
      share: async () => {
        throw new Error("boom")
      },
    })
    await expect(shareEvoluExport({ io, ...input })).rejects.toThrow("boom")
    expect(calls).toContain("remove")
  })

  it("removes the temp folder when the write fails", async () => {
    const { io, calls } = makeIo({
      writeTemp: async () => {
        throw new Error("disk full")
      },
    })
    await expect(shareEvoluExport({ io, ...input })).rejects.toThrow(
      "disk full"
    )
    expect(calls).toEqual(["available", "remove"])
  })

  it("keeps the share outcome when removal itself throws", async () => {
    const { io } = makeIo({
      removeTemp: () => {
        throw new Error("busy")
      },
    })
    await expect(shareEvoluExport({ io, ...input })).resolves.toBe("shared")
  })
})
