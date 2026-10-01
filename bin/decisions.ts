const decisionStatuses = ["accepted", "superseded"] as const

type DecisionStatus = (typeof decisionStatuses)[number]

export interface DecisionRecord {
  readonly file: string
  readonly status: DecisionStatus | null
  readonly testIds: ReadonlyArray<string>
  readonly untestableReason: string | null
}

const enforcedByHeading = "## Enforced by"

const isDecisionStatus = (value: string): value is DecisionStatus =>
  decisionStatuses.some((status) => status === value)

const readStatus = (lines: ReadonlyArray<string>): DecisionStatus | null => {
  const statusLine = lines.find((line) => line.startsWith("Status:"))
  const [word = ""] = (statusLine ?? "")
    .slice("Status:".length)
    .trim()
    .split(/\s+/u)
  return isDecisionStatus(word) ? word : null
}

const readEnforcedBy = (lines: ReadonlyArray<string>) => {
  const start = lines.indexOf(enforcedByHeading)
  if (start === -1) {
    return { testIds: [], untestableReason: null }
  }
  const nextHeading = lines.findIndex(
    (line, index) => index > start && line.startsWith("## ")
  )
  const section = lines.slice(
    start + 1,
    nextHeading === -1 ? undefined : nextHeading
  )
  const testIds = section.flatMap((line) => {
    const match = /^- `(.+)`$/u.exec(line.trim())
    return match?.[1] === undefined ? [] : [match[1]]
  })
  const untestableLine = section.find((line) => line.startsWith("Untestable:"))
  const untestableReason =
    untestableLine === undefined
      ? null
      : untestableLine.slice("Untestable:".length).trim() || null
  return { testIds, untestableReason }
}

export const readDecisionRecord = (
  file: string,
  markdown: string
): DecisionRecord => {
  const lines = markdown.split("\n").map((line) => line.trimEnd())
  return { file, status: readStatus(lines), ...readEnforcedBy(lines) }
}

export const findDecisionProblems = (
  records: ReadonlyArray<DecisionRecord>,
  knownTestIds: ReadonlySet<string>
): ReadonlyArray<string> =>
  records.flatMap(({ file, status, testIds, untestableReason }) => {
    if (status === null) {
      return [`${file}: has no "Status: accepted" or "Status: superseded" line`]
    }
    if (status === "superseded") {
      return []
    }
    if (testIds.length === 0 && untestableReason === null) {
      return [
        `${file}: names no test under "${enforcedByHeading}" and gives no "Untestable:" reason`,
      ]
    }
    return testIds
      .filter((testId) => !knownTestIds.has(testId))
      .map((testId) => `${file}: no test is named "${testId}"`)
  })
