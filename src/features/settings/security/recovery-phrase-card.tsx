import { useId } from "react"

import { PasswordTextarea } from "@/components/password-textarea.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export interface RecoveryPhraseCardProps {
  readonly mnemonic: string
}

export function RecoveryPhraseCard({ mnemonic }: RecoveryPhraseCardProps) {
  const { t } = useTranslation()
  const mnemonicInputId = useId()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security.mnemonic.title")}</CardTitle>
        <CardDescription>
          {t("settings.security.mnemonic.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={mnemonicInputId}>
              {t("settings.security.mnemonic.label")}
            </FieldLabel>
            <PasswordTextarea
              id={mnemonicInputId}
              value={mnemonic}
              hideLabel={t("passwordTextarea.hide")}
              showLabel={t("passwordTextarea.show")}
              readOnly
              aria-readonly="true"
              autoComplete="off"
            />
            <FieldDescription>
              {t("settings.security.mnemonic.help")}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
