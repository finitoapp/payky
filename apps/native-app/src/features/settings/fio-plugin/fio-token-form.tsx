import { parseFioToken } from "@payky/app-shared/fio-token"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { addFioPluginToken } from "@payky/core/modules/fio-plugin/fio-plugin-actions"
import { fioPluginId } from "@payky/core/modules/fio-plugin/fio-plugin-utils"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { Field } from "../../../components/field.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useToast } from "../../../hooks/use-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Adding a token is its own form, as on web: a field on the basic-settings
 * form would write the token again on every save. The token is a secret: it
 * lives in this component's state only, is entered with secure text entry,
 * and is cleared once stored.
 */
export function FioTokenForm() {
  const runToast = useRunToast()
  const toast = useToast()
  const { t } = useTranslation()
  const [token, setToken] = useState("")
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    const parsed = parseFioToken(token)
    if (!parsed.ok) {
      setError(parsed.errorKey)
      return
    }
    setPending(true)
    const saved = await runToast(async (run) => {
      await run.ok(addFioPluginToken({ fioPluginId, token: parsed.token }))
    })
    setPending(false)
    if (!saved) return
    setToken("")
    setRevealed(false)
    toast.success(t("settings.fioPlugin.tokens.add.saved"))
  }

  return (
    <YStack gap="2">
      <Text fontWeight="700">{t("settings.fioPlugin.tokens.add.title")}</Text>
      <Text color="muted-foreground">
        {t("settings.fioPlugin.tokens.add.description")}
      </Text>
      <Field
        label={t("settings.fioPlugin.token.label")}
        value={token}
        disabled={pending}
        secureTextEntry={!revealed}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect={false}
        error={error === null ? undefined : t(error)}
        onChangeText={(text) => {
          setToken(text)
          setError(null)
        }}
      />
      <Text fontSize={13} color="muted-foreground">
        {t("settings.fioPlugin.token.description")}
      </Text>
      <Button
        size="lg"
        label={t(revealed ? "passwordTextarea.hide" : "passwordTextarea.show")}
        variant="outline"
        disabled={pending}
        onPress={() => setRevealed(!revealed)}
      />
      <Button
        size="lg"
        label={t("settings.fioPlugin.tokens.add.submit")}
        pending={pending}
        onPress={() => {
          void submit()
        }}
      />
    </YStack>
  )
}
