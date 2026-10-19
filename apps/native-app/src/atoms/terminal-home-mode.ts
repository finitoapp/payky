import {
  type TerminalHomeMode,
  TerminalHomeModeSchema,
} from "@payky/core/modules/app-settings/app-settings-types"
import { viewStateAtom } from "../platform/view-state-atom.ts"

/**
 * The home mode this device last showed: per-device view state
 * (settings/0001), kept across restarts under web's `localStorage` key.
 */
export const rememberedHomeModeAtom = viewStateAtom<TerminalHomeMode>(
  "payky.terminalHomeMode",
  TerminalHomeModeSchema,
  "numpad"
)
