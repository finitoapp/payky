import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { TerminalHomeMode } from "@payky/core/modules/app-settings/app-settings-types"

/** The home screen's two modes, as the toggle and the settings name them. */
export const homeModeLabelKeys = {
  numpad: "nav.numpad",
  pos: "nav.pos",
} satisfies Record<TerminalHomeMode, TranslationKey>
