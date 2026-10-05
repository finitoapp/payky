import { type ConsoleDep, ok, type Task } from "@evolu/common"
import type { Command } from "commander"
import { z } from "zod"
import { zodCommand } from "zod-commander/zod4"
import { type AiModelDep, askAssistant } from "@/core/ai/assistant.ts"
import { printCliError } from "@/core/cli/cli-errors.ts"
import { createRepoAiTools } from "@/core/cli/repo-ai-tools.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"

export const registerAiCommand =
  (program: Command): Task<void, never, AiModelDep & EvoluDep & ConsoleDep> =>
  (run) => {
    program.addCommand(
      zodCommand({
        name: "ai",
        description:
          "Ask the assistant a question about your data, the docs or the code.",
        args: {
          prompt: z.string().trim().min(1).describe("The question to ask"),
        },
        opts: {},
        async action({ prompt }) {
          const result = await run(
            askAssistant({
              prompt,
              tools: createRepoAiTools(process.cwd()),
              onText: (text) => process.stdout.write(text),
            })
          )
          process.stdout.write("\n")
          if (!result.ok) {
            const { error } = result.error
            printCliError(
              run.deps.console,
              `AI request failed: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        },
      })
    )
    return ok(undefined)
  }
