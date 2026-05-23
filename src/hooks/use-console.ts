import { useAtomValue } from "jotai"
import { consoleAtom, consoleOutputHistoryAtom } from "@/atoms/console.ts"

export function useConsoleHistory() {
  return useAtomValue(consoleOutputHistoryAtom)
}

export function useConsole() {
  return useAtomValue(consoleAtom)
}
