import type { TerminalHomeMode } from "@payky/core/modules/app-settings/app-settings-types"
import { atom } from "jotai"

/**
 * The home mode this device last showed. Web keeps it in `localStorage` as
 * per-device view state (settings/0001); native has no such store and the
 * decision does not ask for persistence, so it lasts until the app restarts
 * and then falls back to the keypad.
 */
export const rememberedHomeModeAtom = atom<TerminalHomeMode>("numpad")
