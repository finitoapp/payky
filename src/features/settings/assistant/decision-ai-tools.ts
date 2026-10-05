import { tool } from "ai"
import { z } from "zod"
import { takeLines } from "@/lib/take-lines.ts"

const maxSearchLines = 200
const maxReadLines = 400

/**
 * The business decisions (docs/decisions), one lazy chunk each. Vite turns
 * the glob into an object literal at build time, so its keys are the static
 * list of decisions and listing them loads nothing.
 */
const decisionLoaders = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("/docs/decisions/**/*.md", {
      query: "?raw",
      import: "default",
    })
  ).map(([path, load]) => [path.slice(1), load])
)
const decisionPaths = Object.keys(decisionLoaders)

/**
 * The assistant's documentation tools in the app (ai/0003): the business
 * decisions bundled with it, which the web has in place of the CLI's
 * repository tools.
 */
export const decisionAiTools = {
  listDecisions: tool({
    description:
      "List Payky's business decision records under a path prefix, such as docs/decisions/payment/. A decision's file name is its title.",
    inputSchema: z.object({ prefix: z.string() }),
    execute: ({ prefix }) =>
      decisionPaths.filter((path) => path.startsWith(prefix)).join("\n"),
  }),
  readDecision: tool({
    description:
      "Read a business decision record, optionally only a 1-based inclusive line range. Lines are prefixed with their number.",
    inputSchema: z.object({
      path: z.string(),
      fromLine: z.number().int().min(1).optional(),
      toLine: z.number().int().min(1).optional(),
    }),
    execute: async ({ path, fromLine = 1, toLine }) => {
      const load = decisionLoaders[path]
      if (load === undefined) return { error: `Not a decision: ${path}` }
      const lines = (await load()).split("\n")
      const numbered = lines
        .slice(fromLine - 1, toLine ?? lines.length)
        .map((line, index) => `${fromLine + index}: ${line}`)
      return takeLines(numbered.join("\n"), maxReadLines)
    },
  }),
  searchDecisions: tool({
    description:
      "Search the business decision records with a case-insensitive JavaScript regular expression. Returns path:line:text matches.",
    inputSchema: z.object({
      pattern: z.string().min(1),
      prefix: z.string().optional(),
    }),
    execute: async ({ pattern, prefix = "" }) => {
      let regExp: RegExp
      try {
        regExp = new RegExp(pattern, "iu")
      } catch (error) {
        return { error: String(error) }
      }
      const matches = await Promise.all(
        Object.entries(decisionLoaders)
          .filter(([path]) => path.startsWith(prefix))
          .map(async ([path, load]) =>
            (await load())
              .split("\n")
              .flatMap((line, index) =>
                regExp.test(line) ? [`${path}:${index + 1}:${line}`] : []
              )
          )
      )
      const lines = matches.flat()
      return lines.length === 0
        ? "No matches."
        : takeLines(lines.join("\n"), maxSearchLines)
    },
  }),
}
