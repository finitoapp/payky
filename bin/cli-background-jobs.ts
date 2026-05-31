import { createConsole, ok, type Task } from "@evolu/common"
import { createRun } from "@evolu/nodejs"
import { type Command, createCommand } from "commander"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { backgroundJobs } from "../src/core/background-jobs/background-jobs"
import { runBackgroundJobs } from "../src/core/background-jobs/run-background-jobs"

declare const process: {
  readonly once: (event: "SIGINT" | "SIGTERM", listener: () => void) => void
}

const waitForShutdownSignal = (): Promise<void> =>
  new Promise((resolve) => {
    process.once("SIGINT", () => resolve())
    process.once("SIGTERM", () => resolve())
  })

export const registerBackgroundJobsCommand =
  (program: Command): Task<void, never, EvoluDep & EvoluOwnerIdDep> =>
  (run) => {
    const { evolu, evoluOwnerId } = run.deps

    const backgroundJobsCommand = createCommand("background-jobs").description(
      "Run Payky background workers."
    )

    backgroundJobsCommand.addCommand(
      createCommand("run")
        .description("Run all registered background jobs until shutdown.")
        .action(async () => {
          const appConsole = createConsole()
          const run = createRun({
            console: appConsole,
            evolu,
            evoluOwnerId,
            onError: (error: unknown) => {
              run.deps.console.error("Background job failed.", error)
            },
          })

          using _backgroundJobsDisposable = await run.orThrow(
            runBackgroundJobs(backgroundJobs)
          )

          run.deps.console.log("Background jobs are running.")
          await waitForShutdownSignal()
          run.deps.console.log("Stopping background jobs.")
        })
    )

    program.addCommand(backgroundJobsCommand)
    return ok(undefined)
  }
