const decisionStatuses = ["accepted", "superseded"] as const

type DecisionStatus = (typeof decisionStatuses)[number]

export interface DecisionRecord {
  readonly file: string
  readonly status: DecisionStatus | null
  /** The `<domain>/NNNN` a "superseded by" points at, if it names one. */
  readonly supersededBy: string | null
  /** The number the `# NNNN Title` heading starts with. */
  readonly headingNumber: string | null
  readonly date: string | null
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

const readSupersededBy = (lines: ReadonlyArray<string>): string | null => {
  const statusLine = lines.find((line) => line.startsWith("Status:")) ?? ""
  return /superseded by ([a-z-]+\/\d{4})\b/u.exec(statusLine)?.[1] ?? null
}

const readHeadingNumber = (lines: ReadonlyArray<string>): string | null =>
  /^# (\d{4}) /u.exec(lines.find((line) => line.startsWith("# ")) ?? "")?.[1] ??
  null

const readDate = (lines: ReadonlyArray<string>): string | null =>
  /^Date: (\d{4}-\d{2}-\d{2})$/u.exec(
    lines.find((line) => line.startsWith("Date:")) ?? ""
  )?.[1] ?? null

export const readDecisionRecord = (
  file: string,
  markdown: string
): DecisionRecord => {
  const lines = markdown.split("\n").map((line) => line.trimEnd())
  return {
    file,
    status: readStatus(lines),
    supersededBy: readSupersededBy(lines),
    headingNumber: readHeadingNumber(lines),
    date: readDate(lines),
    ...readEnforcedBy(lines),
  }
}

/** `docs/decisions/<domain>/NNNN-title.md` as `<domain>/NNNN`, or `null`. */
const decisionIdOf = (file: string): string | null => {
  const match = /([a-z-]+)\/(\d{4})-[^/]+\.md$/u.exec(file)
  return match === null ? null : `${match[1]}/${match[2]}`
}

/**
 * What a record's file and front matter must agree on, which nothing else
 * checks: the file is `<domain>/NNNN-title.md` and its heading carries the
 * same number, no two records share an id, each has a `Date:`, a "superseded
 * by" points at a record that exists, and the README lists exactly the
 * domain directories there are.
 */
export const findDecisionStructureProblems = (
  records: ReadonlyArray<DecisionRecord>,
  {
    readme,
    domains,
  }: { readonly readme: string; readonly domains: ReadonlyArray<string> }
): ReadonlyArray<string> => {
  const ids = records.map(({ file }) => decisionIdOf(file))
  const known = new Set(ids.filter((id) => id !== null))
  const perRecord = records.flatMap((record, index) => {
    const id = ids[index] ?? null
    const problems: string[] = []
    if (id === null) {
      problems.push(`${record.file}: is not named <domain>/NNNN-title.md`)
    } else if (record.headingNumber !== id.slice(-4)) {
      problems.push(
        `${record.file}: its heading is not numbered ${id.slice(-4)} like the file`
      )
    }
    if (id !== null && ids.indexOf(id) !== index) {
      problems.push(`${record.file}: another decision is already ${id}`)
    }
    if (record.date === null) {
      problems.push(`${record.file}: has no "Date: YYYY-MM-DD" line`)
    }
    if (record.status === "superseded") {
      if (record.supersededBy === null) {
        problems.push(
          `${record.file}: is superseded but names no <domain>/NNNN it was superseded by`
        )
      } else if (!known.has(record.supersededBy)) {
        problems.push(
          `${record.file}: is superseded by ${record.supersededBy}, which does not exist`
        )
      }
    }
    return problems
  })
  const listed = [...readme.matchAll(/`([a-z-]+)\/`/gu)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]]
  )
  const missing = domains
    .filter((domain) => !listed.includes(domain))
    .map((domain) => `docs/decisions/README.md: does not list ${domain}/`)
  const extra = listed
    .filter((domain) => !domains.includes(domain))
    .map(
      (domain) =>
        `docs/decisions/README.md: lists ${domain}/, which has no directory`
    )
  return [...perRecord, ...missing, ...extra]
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
