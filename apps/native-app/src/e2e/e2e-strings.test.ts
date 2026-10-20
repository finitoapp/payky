import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { resources } from "@payky/app-shared/i18n/resources"
import { describe, expect, it } from "vitest"

const e2eDir = join(import.meta.dirname, "../../e2e")

describe("e2e flows", () => {
  // A renamed or deleted key then fails `bun run check`, not an e2e run.
  it("name only translation keys that exist", () => {
    const missing = (readdirSync(e2eDir, { recursive: true }) as string[])
      .filter(
        (file) => file.endsWith(".yaml") && !file.startsWith(".generated")
      )
      .flatMap((file) =>
        [
          ...readFileSync(join(e2eDir, file), "utf8").matchAll(
            /output\.tv?\(?\[?"([^"]+)"/g
          ),
        ]
          .map((match) => match[1] ?? "")
          .filter((key) => !(key in resources.en))
          .map((key) => `${file}: ${key}`)
      )
    expect(missing).toEqual([])
  })
})
