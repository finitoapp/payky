import { sqliteTrue } from "@evolu/common"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  defaultEvoluTransportUrls,
  upsertAccountEvoluWebsocketTransport,
} from "@payky/core/evolu/device-account"
import type { DeviceAccountId } from "@payky/core/evolu/device-client"
import { runMutationWithCompletion } from "@payky/core/modules/shared/evolu-utils"
import { WssUrlSchema } from "@payky/core/modules/shared/schema"
import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { deviceEvoluAtom } from "../../../atoms/device-evolu.ts"
import { reloadAppEvoluAtom } from "../../../atoms/evolu-counter.ts"
import { AppButton } from "../../../components/app-button.tsx"
import { Field } from "../../../components/field.tsx"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/** Adds an active WebSocket relay and reopens the app database so it syncs through it. */
export function TransportAddForm({
  accountId,
}: {
  readonly accountId: DeviceAccountId
}) {
  const { t } = useTranslation()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const reloadAppEvolu = useSetAtom(reloadAppEvoluAtom)
  const runToast = useRunToast()
  const [url, setUrl] = useState("")
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<TranslationKey | null>(null)

  const submit = async () => {
    setError(null)
    setSaved(false)
    const result = WssUrlSchema.safeParse(url.trim())
    if (!result.success) {
      setError("settings.security.transports.url.invalid")
      return
    }
    setPending(true)
    const ok = await runToast(async () => {
      await runMutationWithCompletion((options) =>
        upsertAccountEvoluWebsocketTransport(
          deviceEvolu,
          { accountId, isActive: sqliteTrue, url: result.data },
          options
        )
      )
      reloadAppEvolu()
      return undefined
    })
    setPending(false)
    if (ok) {
      setUrl("")
      setSaved(true)
    }
  }

  return (
    <YStack gap="3">
      <Field
        label={t("settings.security.transports.url.label")}
        value={url}
        onChangeText={(next) => {
          setUrl(next)
          setError(null)
          setSaved(false)
        }}
        disabled={pending}
        placeholder={defaultEvoluTransportUrls[0]}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        error={error === null ? undefined : t(error)}
      />
      <Text fontSize={13} color="muted-foreground">
        {t("settings.security.transports.url.description")}
      </Text>
      {saved ? (
        <Text accessibilityLiveRegion="polite">
          {t("settings.security.transports.saved")}
        </Text>
      ) : null}
      <AppButton
        label={t("settings.security.transports.add")}
        variant="secondary"
        pending={pending}
        onPress={() => void submit()}
      />
    </YStack>
  )
}
