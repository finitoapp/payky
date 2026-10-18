import { cashuMintAddErrorKeys } from "@payky/app-shared/cashu-mint-errors"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { addKnownCashuMint } from "@payky/core/cashu/cashu-mints"
import { router } from "expo-router"
import { useState } from "react"
import { Text } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { Field } from "../../../components/field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useCashuRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Adds a mint by URL, as web's `CashuMintNewPage`. The URL check, the mint
 * info/keyset load and the keyset-host check all happen inside core's
 * `addKnownCashuMint`; a mint that does not load is refused and the default
 * stays (cashu.md §7).
 */
export function CashuMintNewPage() {
  const { t } = useTranslation()
  const runToast = useCashuRunToast()
  const { require } = useRequirePermission()
  const [url, setUrl] = useState("")
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    setPending(true)
    setErrorKey(null)
    let added = false
    await runToast(async (run) => {
      const result = await run(addKnownCashuMint(url))
      if (!result.ok) {
        setErrorKey(cashuMintAddErrorKeys[result.error.type])
        return
      }
      added = true
    })
    setPending(false)
    if (added) router.back()
  }

  return (
    <Screen>
      <ScreenHeader title={t("settings.cashuMints.add")} />
      <Field
        label={t("settings.cashuMints.url")}
        value={url}
        disabled={pending}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://"
        error={errorKey === null ? undefined : t(errorKey)}
        onChangeText={(text) => {
          setUrl(text)
          setErrorKey(null)
        }}
      />
      <Text color="muted-foreground">
        {t("settings.cashuMints.addDescription")}
      </Text>
      <AppButton
        label={t("settings.cashuMints.add")}
        pending={pending}
        disabled={url.trim() === ""}
        onPress={() => void submit()}
      />
    </Screen>
  )
}
