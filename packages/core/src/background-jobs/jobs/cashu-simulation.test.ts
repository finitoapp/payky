import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  balanceMatchesMint,
  cashuScenarioArbitrary,
  nothingPending,
  runCashuScenario,
} from "../../testing/cashu-simulation.ts"

/**
 * The Cashu wallet's simulation (`../../testing/cashu-simulation.ts`): random
 * scenarios over several devices and a faulty mint, each brought to rest and
 * checked against the invariants. The seeds are fixed, so a run here is the
 * same run every time.
 */
describe("cashu simulation", () => {
  test("a scenario replays the same from its seed", async () => {
    const [scenario] = fc.sample(cashuScenarioArbitrary(), {
      seed: 172,
      numRuns: 1,
    })
    if (scenario === undefined) throw new Error("no scenario")
    const first = await runCashuScenario(scenario)
    const second = await runCashuScenario(scenario)
    const { elapsedMs: _first, ...firstRun } = first
    const { elapsedMs: _second, ...secondRun } = second
    expect(secondRun).toEqual(firstRun)
  }, 120_000)

  test("a closed operation's call never claims slots past its own outputs, so a lost claim beyond them is booked (cashu/0039)", async () => {
    // Shrunk from a run of seed 40: a topup's claim signed and lost, its
    // outputs inside the slots a closed topup's 64-slot reservation once
    // named, and another device's melt spending them as restored.
    const result = await runCashuScenario({
      devices: 3,
      inputFeePpk: 0,
      funding: 0,
      heldAtRest: "deliver",
      actions: [
        {
          type: "collidingClaims",
          first: 1,
          amounts: [346, 351],
          firstCall: "lostResponse",
        },
        {
          type: "collidingClaims",
          first: 1,
          amounts: [288, 22],
          firstCall: "lostResponse",
        },
        { type: "melt", device: 0, percent: 25 },
      ],
    })

    expect(result.rested).toBe(true)
    expect(nothingPending(result), result.trace.join("\n")).toEqual([])
    expect(balanceMatchesMint(result), result.trace.join("\n")).toEqual([])
  }, 60_000)

  test("the balance matches the mint and nothing is left pending once every scenario rests", async () => {
    const reached = new Set<string>()
    await fc.assert(
      fc.asyncProperty(cashuScenarioArbitrary(), async (scenario) => {
        const result = await runCashuScenario(scenario)
        for (const label of result.coverage) reached.add(label)
        expect(result.rested, result.trace.join("\n")).toBe(true)
        expect(balanceMatchesMint(result), result.trace.join("\n")).toEqual([])
        expect(nothingPending(result), result.trace.join("\n")).toEqual([])
      }),
      { seed: 20261030, numRuns: 20, endOnFailure: true }
    )
    // The runs reach the collisions the simulation is for: a generator that
    // stops reaching them passes the invariants vacuously.
    expect([...reached]).toEqual(
      expect.arrayContaining([
        "block shared by two operations",
        "melt fenced",
        "operation melt paid",
        "operation melt failed",
        "attempt rejected",
      ])
    )
  }, 300_000)
})
