import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { Field } from "../../components/field.tsx"
import { Button } from "../../components/ui/button.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

/**
 * The recovery-phrase form. The phrase lives only in this component's state
 * (gone on unmount), never in a query key, a persisted atom or a log. Hidden
 * (secure, single line) until shown, as web's PasswordTextarea; shown, it is a
 * multiline field. Keyboard learning, suggestions and autofill are off.
 */
export function RestoreAccountStep({
  error,
  pending,
  onRestore,
}: {
  readonly error: TranslationKey | null
  readonly pending: boolean
  readonly onRestore: (mnemonic: string) => void
}) {
  const { t } = useTranslation()
  const [mnemonic, setMnemonic] = useState("")
  const [shown, setShown] = useState(false)
  const [dirtyError, setDirtyError] = useState(true)
  const visibleError = dirtyError ? error : null

  return (
    <YStack gap="3">
      <Field
        label={t("settings.accounts.restore.mnemonic.label")}
        placeholder={t("settings.accounts.restore.mnemonic.placeholder")}
        error={visibleError === null ? undefined : t(visibleError)}
        value={mnemonic}
        disabled={pending}
        secureTextEntry={!shown}
        multiline={shown}
        minH={shown ? 96 : 48}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        importantForAutofill="no"
        keyboardType="visible-password"
        contextMenuHidden
        onChangeText={(next) => {
          setMnemonic(next)
          setDirtyError(false)
        }}
      />
      <Text fontSize="sm" color="muted-foreground">
        {t("settings.accounts.restore.mnemonic.description")}
      </Text>
      <Button
        size="lg"
        label={t(shown ? "passwordTextarea.hide" : "passwordTextarea.show")}
        variant="outline"
        onPress={() => {
          setShown((current) => !current)
        }}
      />
      <Button
        size="lg"
        label={t("onboarding.restore.action")}
        pending={pending}
        onPress={() => {
          setDirtyError(true)
          onRestore(mnemonic)
        }}
      />
    </YStack>
  )
}
