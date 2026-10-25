import { atom } from "jotai"

/**
 * "Later" on the backup reminder (account/0006): hides the popup until the
 * app starts again. Held in memory on purpose — no timer, no stored flag.
 */
export const backupReminderDismissedAtom = atom(false)
