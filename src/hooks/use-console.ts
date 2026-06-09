import { useAtomValue } from "jotai"
import { consoleAtom } from "@/atoms/console.ts"

export function useConsole() {
  return useAtomValue(consoleAtom)
}
