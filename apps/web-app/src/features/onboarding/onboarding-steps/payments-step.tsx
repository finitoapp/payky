import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { Landmark } from "lucide-react"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { BankAccountDescription } from "@/features/shared/bank-account-input.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export function PaymentsStep({
  iban,
  ibanError,
  ibanInputId,
  pending,
  onIbanChange,
}: {
  readonly iban: string
  readonly ibanError: TranslationKey | null
  readonly ibanInputId: string
  readonly pending: boolean
  readonly onIbanChange: (iban: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Field data-disabled={pending} data-invalid={ibanError !== null}>
      <FieldLabel htmlFor={ibanInputId} className="gap-3">
        <Landmark
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground"
        />
        {t("onboarding.payments.iban.title")}
      </FieldLabel>
      <div className="flex flex-col gap-2 pl-8">
        <Input
          id={ibanInputId}
          value={iban}
          disabled={pending}
          aria-invalid={ibanError !== null}
          aria-describedby={
            ibanError ? `${ibanInputId}-error` : `${ibanInputId}-description`
          }
          autoComplete="off"
          inputMode="text"
          onChange={(event) => {
            onIbanChange(event.currentTarget.value)
          }}
        />
        <FieldDescription id={`${ibanInputId}-description`}>
          <BankAccountDescription
            draft={iban}
            descriptionKey="onboarding.payments.iban.description"
          />
        </FieldDescription>
        <FieldError id={`${ibanInputId}-error`}>
          {ibanError ? t(ibanError) : null}
        </FieldError>
      </div>
    </Field>
  )
}
