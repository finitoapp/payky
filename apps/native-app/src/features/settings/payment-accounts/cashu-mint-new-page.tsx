import { cashuMintAddErrorKeys } from "@payky/app-shared/cashu-mint-errors"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { trustCashuMint } from "@payky/core/modules/cashu/cashu-mint-actions"
import { router } from "expo-router"
import { useState } from "react"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Button } from "../../../components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../../../components/ui/field.tsx"
import { Input } from "../../../components/ui/input.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useCashuRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Adds a mint by URL, as web's `CashuMintNewPage`. The URL check, the mint
 * info/keyset load and the keyset-host check all happen inside core's
 * `trustCashuMint`; a mint that does not load is refused, an added one is
 * trusted, and the default stays (cashu/0015).
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
    let added: string | null = null
    await runToast(async (run) => {
      const result = await run(trustCashuMint(url))
      if (!result.ok) {
        setErrorKey(cashuMintAddErrorKeys[result.error.type])
        return
      }
      added = result.value
    })
    setPending(false)
    if (added !== null) {
      router.replace({
        pathname: "/settings/payment-accounts/cashu/mints/[mint]",
        params: { mint: added },
      })
    }
  }

  return (
    <Screen>
      <FadeHeader title={t("settings.cashuMints.add")} />
      <Field>
        <FieldLabel>{t("settings.cashuMints.url")}</FieldLabel>
        <Input
          value={url}
          disabled={pending}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          placeholder="https://"
          invalid={errorKey !== null}
          onChangeText={(text) => {
            setUrl(text)
            setErrorKey(null)
          }}
        />
        <FieldDescription>
          {t("settings.cashuMints.addDescription")}
        </FieldDescription>
        <FieldError>{errorKey === null ? undefined : t(errorKey)}</FieldError>
      </Field>
      <Button
        size="lg"
        label={t("settings.cashuMints.add")}
        pending={pending}
        disabled={url.trim() === ""}
        onPress={() => void submit()}
      />
    </Screen>
  )
}
