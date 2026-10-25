import { isBackupReminderDue } from "@payky/app-shared/recovery-backup"
import { backupReminderDismissedAtom } from "@payky/app-shared/recovery-backup-state"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { firstPaidPaymentQuery } from "@payky/core/modules/payment/payment-queries"
import { useAtom, useAtomValue } from "jotai"
import { accountAtom } from "@/atoms/account.ts"
import { useAccess } from "@/hooks/use-access.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * Whether the "back up your recovery phrase" line shows (account/0006):
 * only after the account's first paid payment, until the phrase is verified,
 * never on a demo account, and only where this device may open Security.
 */
export function useBackupReminder() {
  const account = useAtomValue(accountAtom)
  const { effective } = useAccess()
  const { data: paid } = useEvoluQuery(firstPaidPaymentQuery)
  const { data: settingsRows } = useEvoluQuery(settingsQuery)
  const [dismissed, setDismissed] = useAtom(backupReminderDismissedAtom)

  const due = isBackupReminderDue({
    hasPaidPayment: paid.length > 0,
    verifiedAt: settingsRows[0]?.recoveryPhraseVerifiedAt ?? null,
    isDemo: account.demo !== null,
  })

  return {
    visible: due && !dismissed && effective.has("admin"),
    dismiss: () => setDismissed(true),
  }
}
