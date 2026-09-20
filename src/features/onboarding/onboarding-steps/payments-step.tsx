import { Landmark } from "lucide-react"

import {
  CardContent,
  CardDescription,
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
import { Input } from "@/components/ui/input.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * The one question a new terminal needs answered: which bank account
 * receives transfers. Bitcoin (cashu) is on by default and needs no input;
 * cash and Spark are opt-in later in Settings. The account can be left for
 * later — an empty field skips bank transfers rather than blocking setup.
 */
export function PaymentsStep({
  iban,
  ibanError,
  ibanInputId,
  detectedBank,
  pending,
  onIbanChange,
}: {
  readonly iban: string
  readonly ibanError: TranslationKey | null
  readonly ibanInputId: string
  /** The bank the entered account belongs to, once it parses. */
  readonly detectedBank: string | null
  readonly pending: boolean
  readonly onIbanChange: (iban: string) => void
}) {
  const { t } = useTranslation()
  const accountEntered = iban.trim() !== ""

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.payments.title")}</CardTitle>
        <CardDescription>
          {t("onboarding.payments.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={ibanError !== null}>
            <FieldLabel htmlFor={ibanInputId}>
              <Landmark className="text-muted-foreground" />
              {t("onboarding.payments.bankAccount.label")}
            </FieldLabel>
            <Input
              id={ibanInputId}
              value={iban}
              disabled={pending}
              aria-invalid={ibanError !== null}
              autoComplete="off"
              inputMode="text"
              placeholder={t("onboarding.payments.bankAccount.placeholder")}
              onChange={(event) => {
                onIbanChange(event.currentTarget.value)
              }}
            />
            <FieldDescription>
              {ibanError === null && accountEntered
                ? detectedBank === null
                  ? t("onboarding.payments.bankAccount.bankUnknown")
                  : t("onboarding.payments.bankAccount.bankDetected", {
                      bank: detectedBank,
                    })
                : t("onboarding.payments.bankAccount.description")}
            </FieldDescription>
            <FieldError>{ibanError ? t(ibanError) : null}</FieldError>
          </Field>
          <p className="text-sm text-muted-foreground">
            {t("onboarding.payments.skipHint")}
          </p>
        </FieldGroup>
      </CardContent>
    </>
  )
}
