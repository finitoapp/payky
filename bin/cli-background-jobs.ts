import { createConsole, ok, type Task } from "@evolu/common"
import { runMain } from "@evolu/nodejs"
import { type Command, createCommand } from "commander"
import { createInProcessLockManager } from "@/core/cli/in-process-lock-manager.ts"
import {
  createDateDep,
  createFetchDep,
  type EvoluOwnerIdDep,
} from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { backgroundJobs } from "../src/core/background-jobs/background-jobs"
import { runBackgroundJobs } from "../src/core/background-jobs/run-background-jobs"

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
          await runMain({
            console: appConsole,
            evolu,
            evoluOwnerId,
            ...createDateDep(),
            ...createFetchDep(),
            lockManager: createInProcessLockManager(),
            onError: (error: unknown) => {
              appConsole.error("Background job failed.", error)
            },
          })(async (run) => {
            const backgroundJobsDisposable = await run.ok(
              runBackgroundJobs(backgroundJobs)
            )
            run.deps.console.log("Background jobs are running.")
            return ok(backgroundJobsDisposable)
          })
        })
    )

    program.addCommand(backgroundJobsCommand)
    return ok(undefined)
  }
