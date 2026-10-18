import { useState } from "react"
import { AppButton } from "../../../components/app-button.tsx"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { WarningPanel } from "../../shared/warning-panel.tsx"

/**
 * Support may have nowhere to reply: the account's DM relay list could not be
 * checked, or publishing it failed (support/0001). Retrying checks again, and
 * publishes when the list turns out missing, or publishes again; publishing
 * over a list that could not be checked is a separate, confirmed choice,
 * because it replaces the list Linky may rely on.
 */
export function DmInboxWarning({
  unverified,
  publishFailed,
  onVerify,
  onPublish,
}: {
  readonly unverified: boolean
  readonly publishFailed: boolean
  readonly onVerify: () => Promise<void>
  readonly onPublish: () => Promise<void>
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const busyWhile = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <WarningPanel
      title={t(
        unverified
          ? "settings.supportChat.inbox.unverified"
          : "settings.supportChat.inbox.publishFailed"
      )}
    >
      <AppButton
        label={t("settings.supportChat.retry")}
        variant="secondary"
        disabled={busy}
        onPress={() => {
          void busyWhile(unverified && !publishFailed ? onVerify : onPublish)
        }}
      />
      {unverified ? (
        <AppButton
          label={t("settings.supportChat.inbox.publishAnyway")}
          variant="secondary"
          disabled={busy}
          onPress={() => {
            void busyWhile(async () => {
              const confirmed = await confirm({
                title: t("settings.supportChat.inbox.confirm.title"),
                description: t(
                  "settings.supportChat.inbox.confirm.description"
                ),
                confirmLabel: t("settings.supportChat.inbox.confirm.confirm"),
                cancelLabel: t("settings.supportChat.inbox.confirm.cancel"),
                variant: "destructive",
              })
              if (confirmed) await onPublish()
            })
          }}
        />
      ) : null}
    </WarningPanel>
  )
}
