import { describe, expect, test } from "vitest"

import { findDecisionProblems, readDecisionRecord } from "./decisions.ts"

const decision = (
  status: string,
  enforcedBy: string
) => `# 0001 Cash sales report the cash received

Status: ${status}
Date: 2026-09-28

## Decision

The sale reports the cash received.

## Enforced by

${enforcedBy}

## Consequences

The cash register keeps the charge.
`

const knownTestIds = new Set([
  "src/core/modules/eet/eet-actions.test.ts > createEetSale > reports what was received for $name",
  "e2e/eet.spec.ts > a cash sale is reported as the cash received",
])

describe("readDecisionRecord", () => {
  test("reads the status and every test the decision names", () => {
    expect(
      readDecisionRecord(
        "docs/decisions/0001-cash.md",
        decision(
          "accepted",
          "- `src/core/modules/eet/eet-actions.test.ts > createEetSale > reports what was received for $name`\n- `e2e/eet.spec.ts > a cash sale is reported as the cash received`"
        )
      )
    ).toEqual({
      file: "docs/decisions/0001-cash.md",
      status: "accepted",
      testIds: [...knownTestIds],
      untestableReason: null,
    })
  })

  test("reads the reason a decision has no test", () => {
    expect(
      readDecisionRecord(
        "docs/decisions/0002-table.md",
        decision(
          "accepted",
          "Untestable: an older version is not in this repository to run against."
        )
      )
    ).toMatchObject({
      testIds: [],
      untestableReason:
        "an older version is not in this repository to run against.",
    })
  })

  test("reads a superseded decision by its first word", () => {
    expect(
      readDecisionRecord(
        "docs/decisions/0003-old.md",
        decision("superseded by 0009", "")
      )
    ).toMatchObject({ status: "superseded" })
  })
})

describe("findDecisionProblems", () => {
  const record = (
    overrides: Partial<ReturnType<typeof readDecisionRecord>>
  ) => ({
    file: "docs/decisions/0001-cash.md",
    status: "accepted" as const,
    testIds: [...knownTestIds],
    untestableReason: null,
    ...overrides,
  })

  test("accepts a decision held by tests that exist", () => {
    expect(findDecisionProblems([record({})], knownTestIds)).toEqual([])
  })

  test("names a test that does not exist", () => {
    expect(
      findDecisionProblems(
        [record({ testIds: ["e2e/eet.spec.ts > a renamed test"] })],
        knownTestIds
      )
    ).toEqual([
      'docs/decisions/0001-cash.md: no test is named "e2e/eet.spec.ts > a renamed test"',
    ])
  })

  test("refuses an accepted decision with neither a test nor a reason", () => {
    expect(
      findDecisionProblems([record({ testIds: [] })], knownTestIds)
    ).toEqual([
      'docs/decisions/0001-cash.md: names no test under "## Enforced by" and gives no "Untestable:" reason',
    ])
  })

  test("accepts an untestable decision that says why", () => {
    expect(
      findDecisionProblems(
        [record({ testIds: [], untestableReason: "no older build to run" })],
        knownTestIds
      )
    ).toEqual([])
  })

  test("refuses a decision without a status", () => {
    expect(
      findDecisionProblems([record({ status: null })], knownTestIds)
    ).toEqual([
      'docs/decisions/0001-cash.md: has no "Status: accepted" or "Status: superseded" line',
    ])
  })

  test("skips the tests of a superseded decision", () => {
    expect(
      findDecisionProblems(
        [record({ status: "superseded", testIds: ["gone > test"] })],
        knownTestIds
      )
    ).toEqual([])
  })
})
