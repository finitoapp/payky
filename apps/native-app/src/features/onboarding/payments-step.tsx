import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { Text } from "tamagui"
import { Field } from "../../components/field.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

/** The optional bank account; a nonblank input turns bank transfers on. */
export function PaymentsStep({
  iban,
  ibanError,
  pending,
  onIbanChange,
}: {
  readonly iban: string
  readonly ibanError: TranslationKey | null
  readonly pending: boolean
  readonly onIbanChange: (iban: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Field
        label={t("onboarding.payments.iban.title")}
        value={iban}
        disabled={pending}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect={false}
        error={ibanError === null ? undefined : t(ibanError)}
        onChangeText={onIbanChange}
      />
      <Text fontSize="sm" color="muted-foreground">
        {t("onboarding.payments.iban.description")}
      </Text>
    </>
  )
}
