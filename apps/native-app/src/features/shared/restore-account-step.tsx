import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import KeyRound from "lucide-react-native/icons/key-round"
import { useState } from "react"
import { YStack } from "tamagui"
import { PasswordTextarea } from "../../components/password-textarea.tsx"
import { Button } from "../../components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../components/ui/field.tsx"
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
  submitFullWidth = false,
}: {
  readonly error: TranslationKey | null
  readonly pending: boolean
  readonly onRestore: (mnemonic: string) => void
  /** Web's onboarding wrapper makes this submit full-width and 44px high. */
  readonly submitFullWidth?: boolean
}) {
  const { t } = useTranslation()
  const [mnemonic, setMnemonic] = useState("")
  const [shown, setShown] = useState(false)
  const [dirtyError, setDirtyError] = useState(true)
  const visibleError = dirtyError ? error : null

  return (
    <YStack gap="4">
      <FieldGroup>
        <Field>
          <FieldLabel>
            {t("settings.accounts.restore.mnemonic.label")}
          </FieldLabel>
          <PasswordTextarea
            placeholder={t("settings.accounts.restore.mnemonic.placeholder")}
            value={mnemonic}
            disabled={pending}
            shown={shown}
            onShownChange={setShown}
            invalid={visibleError !== null}
            contextMenuHidden
            onChangeText={(next) => {
              setMnemonic(next)
              setDirtyError(false)
            }}
            hideLabel={t("passwordTextarea.hide")}
            showLabel={t("passwordTextarea.show")}
          />
          <FieldDescription>
            {t("settings.accounts.restore.mnemonic.description")}
          </FieldDescription>
          <FieldError>
            {visibleError === null ? undefined : t(visibleError)}
          </FieldError>
        </Field>
      </FieldGroup>
      <Button
        w={submitFullWidth ? "100%" : undefined}
        minH={submitFullWidth ? 44 : undefined}
        self={submitFullWidth ? undefined : "flex-end"}
        label={t("onboarding.restore.action")}
        iconStart={KeyRound}
        pending={pending}
        onPress={() => {
          setDirtyError(true)
          onRestore(mnemonic)
        }}
      />
    </YStack>
  )
}
