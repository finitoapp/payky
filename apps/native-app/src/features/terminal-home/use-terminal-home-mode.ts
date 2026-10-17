import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import {
  parseEnabledHomeModes,
  resolveTerminalHomeMode,
} from "@payky/core/modules/app-settings/app-settings-utils"
import { useAtom } from "jotai"
import { rememberedHomeModeAtom } from "../../atoms/terminal-home-mode.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"

/**
 * Which view the home screen shows and which it offers (settings/0001), as
 * web's `useTerminalHomeMode`: the offered set is the synced
 * `enabledHomeModesJson`; while the remembered mode is not among them the
 * first offered one shows, and the remembered value is left alone.
 */
export function useTerminalHomeMode() {
  const [remembered, setMode] = useAtom(rememberedHomeModeAtom)
  const [settings] = useEvoluQuery(settingsQuery).data
  const enabledModes = parseEnabledHomeModes(settings?.enabledHomeModesJson)

  return {
    mode: resolveTerminalHomeMode(remembered, enabledModes),
    enabledModes,
    setMode,
  }
}
