import { execFile } from "node:child_process"
import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { promisify } from "node:util"
import { z } from "zod"

import { jsonCodec } from "@/zod-utils.ts"

import { findDecisionProblems, readDecisionRecord } from "./decisions.ts"

const decisionsDirectory = "docs/decisions"

const run = promisify(execFile)

const VitestListSchema = z.array(
  z.object({ name: z.string(), file: z.string() })
)

interface PlaywrightSuite {
  readonly title: string
  readonly file: string
  readonly specs: ReadonlyArray<{ readonly title: string }>
  readonly suites?: ReadonlyArray<PlaywrightSuite>
}

const PlaywrightSuiteSchema: z.ZodType<PlaywrightSuite> = z.object({
  title: z.string(),
  file: z.string(),
  specs: z.array(z.object({ title: z.string() })),
  get suites() {
    return z.array(PlaywrightSuiteSchema).optional()
  },
})

const PlaywrightListSchema = z.object({
  config: z.object({ rootDir: z.string() }),
  suites: z.array(PlaywrightSuiteSchema),
})

const listUnitTestIds = async (): Promise<ReadonlyArray<string>> => {
  const { stdout } = await run("bunx", ["vitest", "list", "--json"], {
    maxBuffer: 64 * 1024 * 1024,
  })
  return z
    .decode(jsonCodec(VitestListSchema), stdout)
    .map(({ name, file }) => `${relative(process.cwd(), file)} > ${name}`)
}

const listSuiteTestIds = (
  suite: PlaywrightSuite,
  titles: ReadonlyArray<string>,
  rootDir: string
): ReadonlyArray<string> => [
  ...suite.specs.map(
    (spec) =>
      `${relative(process.cwd(), join(rootDir, suite.file))} > ${[...titles, spec.title].join(" > ")}`
  ),
  ...(suite.suites ?? []).flatMap((child) =>
    listSuiteTestIds(child, [...titles, child.title], rootDir)
  ),
]

const listEndToEndTestIds = async (): Promise<ReadonlyArray<string>> => {
  const { stdout } = await run(
    "bunx",
    ["playwright", "test", "--list", "--reporter=json"],
    { maxBuffer: 64 * 1024 * 1024 }
  )
  const { config, suites } = z.decode(jsonCodec(PlaywrightListSchema), stdout)
  return suites.flatMap((suite) => listSuiteTestIds(suite, [], config.rootDir))
}

const readDecisionRecords = async () => {
  const files = (await readdir(decisionsDirectory, { recursive: true }))
    .filter((file) => file.endsWith(".md") && !file.endsWith("README.md"))
    .sort()
  return await Promise.all(
    files.map(async (file) => {
      const path = join(decisionsDirectory, file)
      return readDecisionRecord(path, await readFile(path, "utf8"))
    })
  )
}

const [records, unitTestIds, endToEndTestIds] = await Promise.all([
  readDecisionRecords(),
  listUnitTestIds(),
  listEndToEndTestIds(),
])
const problems = findDecisionProblems(
  records,
  new Set([...unitTestIds, ...endToEndTestIds])
)

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem)
  }
  process.exit(1)
}
const accepted = records.filter(({ status }) => status === "accepted").length
console.log(`${accepted} accepted decisions, each held by a test or explained.`)
