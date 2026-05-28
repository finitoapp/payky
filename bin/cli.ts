import { createCommand } from "commander"
import { accountTransfersCommand } from "./cli-account-transfers"
import { accountsCommand } from "./cli-accounts"
import { backgroundJobsCommand } from "./cli-background-jobs"
import { billsCommand } from "./cli-bills"
import { catalogItemsCommand } from "./cli-catalog-items"
import { fioPluginsCommand } from "./cli-fio-plugins"
import { paymentsCommand } from "./cli-payments"

declare const process: {
  readonly argv: ReadonlyArray<string>
}

const program = createCommand()
program
  .name("payky")
  .description("Manage Payky local data and background jobs.")
  .version("0.0.1")

program.addCommand(catalogItemsCommand)
program.addCommand(billsCommand)
program.addCommand(accountsCommand)
program.addCommand(accountTransfersCommand)
program.addCommand(paymentsCommand)
program.addCommand(fioPluginsCommand)
program.addCommand(backgroundJobsCommand)

program.parse(process.argv)
