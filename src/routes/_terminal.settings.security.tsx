import { createFileRoute } from "@tanstack/react-router"
import { useAtomValue } from "jotai"

import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { EvoluTransportCard } from "@/features/settings/security/evolu-transport-card.tsx"
import { RecoveryPhraseCard } from "@/features/settings/security/recovery-phrase-card.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/security")({
  component: SecuritySettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function SecuritySettingsPage() {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.security.title")} />
      <div className="flex flex-col gap-5">
        <RecoveryPhraseCard mnemonic={account.mnemonic} />
        <EvoluTransportCard accountId={account.id} />
      </div>
    </>
  )
}
