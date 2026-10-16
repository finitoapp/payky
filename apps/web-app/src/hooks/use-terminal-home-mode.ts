import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import {
  type TerminalHomeMode,
  TerminalHomeModeSchema,
} from "@payky/core/modules/app-settings/app-settings-types"
import {
  parseEnabledHomeModes,
  resolveTerminalHomeMode,
} from "@payky/core/modules/app-settings/app-settings-utils"
import { useLocalStorageState } from "@payky/web-shared/use-local-storage-state"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

const TERMINAL_HOME_MODE_STORAGE_KEY = "payky.terminalHomeMode"

/**
 * Which view the terminal home screen shows, and which views it offers.
 *
 * The remembered view is view state, not application data, so it belongs in
 * `localStorage` rather than the device Evolu database — see
 * `useLocalStorageState`. The offered views are a synced app setting; while
 * the remembered one is not among them, the first offered one shows instead.
 * The remembered value is left alone, so re-enabling its mode brings it back.
 */
export function useTerminalHomeMode() {
  const [remembered, setMode] = useLocalStorageState<TerminalHomeMode>(
    TERMINAL_HOME_MODE_STORAGE_KEY,
    "numpad",
    TerminalHomeModeSchema
  )
  const [settings] = useEvoluQuery(settingsQuery).data
  const enabledModes = parseEnabledHomeModes(settings?.enabledHomeModesJson)

  return {
    mode: resolveTerminalHomeMode(remembered, enabledModes),
    enabledModes,
    setMode,
  }
}
