import { z } from "zod"
import { useLocalStorageState } from "@/hooks/use-local-storage-state.ts"

const TERMINAL_HOME_MODE_STORAGE_KEY = "payky.terminalHomeMode"

const TerminalHomeModeSchema = z.enum(["numpad", "pos"])
type TerminalHomeMode = z.output<typeof TerminalHomeModeSchema>

/**
 * Which view the terminal home screen shows: view state, not application
 * data, so it belongs in `localStorage` rather than the device Evolu
 * database — see `useLocalStorageState`.
 */
export function useTerminalHomeMode() {
  return useLocalStorageState<TerminalHomeMode>(
    TERMINAL_HOME_MODE_STORAGE_KEY,
    "numpad",
    TerminalHomeModeSchema
  )
}
