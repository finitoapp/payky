import {
  type ConsoleDep,
  createConsole,
  createRun,
  type Task,
} from "@evolu/common"
import { type Command, createCommand } from "commander"
import {
  createDateDep,
  type DateDep,
  type EvoluOwnerIdDep,
} from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluCli } from "../src/core/evolu/cli-client"
import { registerAccountTransfersCommand } from "./cli-account-transfers"
import { registerAccountsCommand } from "./cli-accounts"
import { registerBackgroundJobsCommand } from "./cli-background-jobs"
import { registerBillsCommand } from "./cli-bills"
import { registerCatalogItemsCommand } from "./cli-catalog-items"
import { registerFioPluginsCommand } from "./cli-fio-plugins"
import { registerPaymentNumberSeriesCommand } from "./cli-payment-number-series"
import { registerPaymentsCommand } from "./cli-payments"
import { registerTablesCommand } from "./cli-tables"

declare const process: {
  readonly argv: ReadonlyArray<string>
}

const commands: ((
  program: Command
) => Task<void, never, EvoluDep & EvoluOwnerIdDep & ConsoleDep & DateDep>)[] = [
  registerCatalogItemsCommand,
  registerBillsCommand,
  registerAccountsCommand,
  registerAccountTransfersCommand,
  registerPaymentsCommand,
  registerPaymentNumberSeriesCommand,
  registerTablesCommand,
  registerFioPluginsCommand,
  registerBackgroundJobsCommand,
]

const main = async () => {
  await using evoluCli = await createEvoluCli()
  const { evolu } = evoluCli
  const evoluOwnerId = evolu.appOwner.id
  const console = createConsole({
    level: "debug",
  })

  await using run = createRun({
    evolu,
    evoluOwnerId,
    console,
    ...createDateDep(),
  })

  const program = createCommand()
  program
    .name("payky")
    .description("Manage Payky local data and background jobs.")
    .version("0.0.1")

  for (const command of commands) {
    run(command(program))
  }

  await program.parseAsync(process.argv)
}

main()
