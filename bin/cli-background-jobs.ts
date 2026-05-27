import { createCommand } from "commander"
import { backgroundJobs } from "../src/core/background-jobs/background-jobs"
import { runBackgroundJobs } from "../src/core/background-jobs/run-background-jobs"
import { createEvoluCli } from "../src/core/evolu/cli-client"

declare const process: {
  readonly once: (event: "SIGINT" | "SIGTERM", listener: () => void) => void
}

const waitForShutdownSignal = (): Promise<void> =>
  new Promise((resolve) => {
    process.once("SIGINT", () => resolve())
    process.once("SIGTERM", () => resolve())
  })

export const backgroundJobsCommand = createCommand(
  "background-jobs"
).description("Run Payky background workers.")

backgroundJobsCommand.addCommand(
  createCommand("run")
    .description("Run all registered background jobs until shutdown.")
    .action(async () => {
      await using evoluCli = await createEvoluCli()
      const { evolu } = evoluCli

      using _backgroundJobsDisposable = runBackgroundJobs(backgroundJobs, {
        evolu,
        onError: (error) => {
          console.error("Background job failed.", error)
        },
      })

      console.log("Background jobs are running.")
      await waitForShutdownSignal()
      console.log("Stopping background jobs.")
    })
)
