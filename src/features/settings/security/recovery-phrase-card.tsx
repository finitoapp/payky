import { CopyIcon } from "lucide-react"
import { useId } from "react"
import { PasswordTextarea } from "@/components/password-textarea.tsx"
import { Button } from "@/components/ui/button.tsx"
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
import { copyToClipboard } from "@/lib/clipboard.ts"

interface RecoveryPhraseCardProps {
  readonly mnemonic: string
}

export function RecoveryPhraseCard({ mnemonic }: RecoveryPhraseCardProps) {
  const { t } = useTranslation()
  const mnemonicInputId = useId()

  const copyMnemonic = () => {
    void copyToClipboard(mnemonic, {
      copied: t("settings.security.mnemonic.copied"),
      failed: t("settings.security.mnemonic.copyError"),
    })
  }

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
            <FieldDescription>
              {t("settings.security.mnemonic.warning")}
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyMnemonic}
          >
            <CopyIcon data-icon="inline-start" />
            {t("settings.security.mnemonic.copy")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
