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
  readonly getEntries: () => ReadonlyArray<ConsoleOutputHistoryEntry>
  readonly clearEntries: () => void
  readonly subscribe: (listener: () => void) => () => void
}

export interface ConsoleOutputHistoryEntry extends ConsoleEntry {
  readonly createdAt: number
}

function createConsoleOutputHistory({
  limit,
}: {
  readonly limit: number
}): ConsoleOutputHistory {
  const entries: ConsoleOutputHistoryEntry[] = []
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    write: (entry) => {
      entries.push({
        ...entry,
        createdAt: Date.now(),
      })

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
    level: "debug",
    output: createMultiOutput([
      createNativeConsoleOutput(),
      consoleOutputHistory,
    ]),
  })
})
