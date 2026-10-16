import type { Console } from "@evolu/common"

declare const process: {
  exitCode?: number
}

export const printCliError = (console: Console, message: string): void => {
  console.error(message)
  process.exitCode = 1
}
