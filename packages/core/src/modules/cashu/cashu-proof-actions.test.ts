import { Amount, type Proof } from "@cashu/cashu-ts"
import { testCreateConsole } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { testMintUrl } from "../../testing/cashu.ts"
import { toNewCashuProofs } from "./cashu-proof-actions.ts"

const proof = (
  overrides: Partial<Omit<Proof, "amount">> & { readonly amount?: number } = {}
): Proof => ({
  id: "00ad268c4d1f5826",
  secret: `secret-${Math.random()}`,
  C: "02".padEnd(66, "a"),
  ...overrides,
  amount: Amount.from(overrides.amount ?? 4),
})

describe("toNewCashuProofs", () => {
  test("a proof signed malformed is left out and logged, never the valid ones signed with it", () => {
    const console = testCreateConsole()
    const valid = [proof({ amount: 1 }), proof({ amount: 8 })]

    const rows = toNewCashuProofs(
      { console },
      [
        valid[0] ?? proof(),
        proof({ amount: 0 }),
        proof({ C: "not hex" }),
        proof({ secret: "" }),
        proof({ id: "I2yN+iRYfkzT" }),
        valid[1] ?? proof(),
      ],
      testMintUrl
    )

    expect(rows.map((row) => row.secret)).toEqual(
      valid.map((each) => each.secret)
    )
    expect(
      console.getEntriesSnapshot().filter((entry) => entry.method === "warn")
    ).toHaveLength(4)
  })
})
