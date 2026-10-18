import type { ConsoleEntry, ConsoleOutput } from "@evolu/common"

export interface ConsoleOutputHistory extends ConsoleOutput {
  readonly getEntries: () => ReadonlyArray<ConsoleOutputHistoryEntry>
  readonly clearEntries: () => void
  readonly subscribe: (listener: () => void) => () => void
}

export interface ConsoleOutputHistoryEntry extends ConsoleEntry {
  readonly createdAt: number
}

export function createConsoleOutputHistory({
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

export const formatConsoleArgs = (args: ReadonlyArray<unknown>): string =>
  args.map(formatConsoleArg).join(" ")

function formatConsoleArg(arg: unknown): string {
  if (typeof arg === "string") return arg
  if (typeof arg === "undefined") return "undefined"
  if (typeof arg === "bigint") return `${arg.toString()}n`
  if (typeof arg === "symbol") return arg.toString()
  if (typeof arg === "function") return `[Function ${arg.name || "anonymous"}]`
  if (arg instanceof Error) return arg.stack ?? arg.message

  try {
    const json = JSON.stringify(arg, null, 2)
    return json ?? String(arg)
  } catch {
    return String(arg)
  }
}
