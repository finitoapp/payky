import {
  type ConsoleEntry,
  type ConsoleOutput,
  createConsole,
  createMultiOutput,
  createNativeConsoleOutput,
} from "@evolu/common"
import { atom } from "jotai"

const consoleOutputHistoryLimit = 1000

export interface ConsoleOutputHistory extends ConsoleOutput {
  readonly getEntries: () => ReadonlyArray<ConsoleEntry>
  readonly clearEntries: () => void
  readonly subscribe: (listener: () => void) => () => void
}

function createConsoleOutputHistory({
  limit,
}: {
  readonly limit: number
}): ConsoleOutputHistory {
  const entries: ConsoleEntry[] = []
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    write: (entry) => {
      entries.push(entry)

      if (entries.length > limit) {
        entries.splice(0, entries.length - limit)
      }

      notify()
    },

    getEntries: () => [...entries],

    clearEntries: () => {
      entries.length = 0
      notify()
    },

    subscribe: (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const consoleOutputHistoryAtom = atom(() =>
  createConsoleOutputHistory({
    limit: consoleOutputHistoryLimit,
  })
)

export const consoleAtom = atom((get) => {
  const consoleOutputHistory = get(consoleOutputHistoryAtom)

  return createConsole({
    output: createMultiOutput([
      createNativeConsoleOutput(),
      consoleOutputHistory,
    ]),
  })
})
