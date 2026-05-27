import { createCommand } from "commander"
import { billsCommand } from "./cli-bills"
import { catalogItemsCommand } from "./cli-catalog-items"

declare const process: {
  readonly argv: ReadonlyArray<string>
}

const program = createCommand()
program.name("payky").description("Payky CLI").version("0.0.1")

program.addCommand(catalogItemsCommand)
program.addCommand(billsCommand)

program.parse(process.argv)
