import { ChevronLeft, KeyRound } from "lucide-react"
import { useId } from "react"

import { PasswordTextarea } from "@/components/password-textarea.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function RestoreAccountStep({
  error,
  mnemonic,
  pending,
  onBack,
  onMnemonicChange,
  onRestore,
}: {
  readonly error: TranslationKey | null
  readonly mnemonic: string
  readonly pending: boolean
  readonly onBack: () => void
  readonly onMnemonicChange: (mnemonic: string) => void
  readonly onRestore: () => void
}) {
  const { t } = useTranslation()
  const mnemonicInputId = useId()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.restore.title")}</CardTitle>
        <CardDescription>{t("onboarding.restore.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onRestore()
          }}
        >
          <FieldGroup>
            <Field data-invalid={error !== null}>
              <FieldLabel htmlFor={mnemonicInputId}>
                {t("settings.accounts.restore.mnemonic.label")}
              </FieldLabel>
              <PasswordTextarea
                id={mnemonicInputId}
                value={mnemonic}
                hideLabel={t("passwordTextarea.hide")}
                showLabel={t("passwordTextarea.show")}
                disabled={pending}
                aria-invalid={error !== null}
                autoComplete="off"
                placeholder={t(
                  "settings.accounts.restore.mnemonic.placeholder"
                )}
                onChange={(event) => {
                  onMnemonicChange(event.currentTarget.value)
                }}
              />
              <FieldDescription>
                {t("settings.accounts.restore.mnemonic.description")}
              </FieldDescription>
              <FieldError>{error ? t(error) : null}</FieldError>
            </Field>
          </FieldGroup>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={pending}>
              <KeyRound data-icon="inline-start" />
              {t("onboarding.restore.action")}
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onBack}
        >
          <ChevronLeft data-icon="inline-start" />
          {t("onboarding.back")}
        </Button>
      </CardFooter>
    </>
  )
}
