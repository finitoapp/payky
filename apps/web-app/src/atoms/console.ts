import {
  createConsole,
  createMultiOutput,
  createNativeConsoleOutput,
} from "@evolu/common"
import { createConsoleOutputHistory } from "@payky/app-shared/console-history"
import { atom } from "jotai"

export type {
  ConsoleOutputHistory,
  ConsoleOutputHistoryEntry,
} from "@payky/app-shared/console-history"

const consoleOutputHistoryLimit = 1000

export const consoleOutputHistoryAtom = atom(() =>
  createConsoleOutputHistory({
    limit: consoleOutputHistoryLimit,
  })
)

export const consoleAtom = atom((get) => {
  const consoleOutputHistory = get(consoleOutputHistoryAtom)

  return createConsole({
    level: "debug",
    output: createMultiOutput([
      createNativeConsoleOutput(),
      consoleOutputHistory,
    ]),
  })
})
