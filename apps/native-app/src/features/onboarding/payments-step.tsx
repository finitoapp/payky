import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { Text } from "tamagui"
import { Field } from "../../components/field.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

/** The optional public business name and bank account (a nonblank one turns bank transfers on). */
export function PaymentsStep({
  businessName,
  businessNameError,
  iban,
  ibanError,
  pending,
  onBusinessNameChange,
  onIbanChange,
}: {
  readonly businessName: string
  readonly businessNameError: TranslationKey | null
  readonly iban: string
  readonly ibanError: TranslationKey | null
  readonly pending: boolean
  readonly onBusinessNameChange: (name: string) => void
  readonly onIbanChange: (iban: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Field
        label={t("onboarding.businessName.label")}
        placeholder={t("onboarding.businessName.placeholder")}
        value={businessName}
        disabled={pending}
        autoComplete="organization"
        error={businessNameError === null ? undefined : t(businessNameError)}
        onChangeText={onBusinessNameChange}
      />
      <Text fontSize="sm" color="muted-foreground">
        {t("onboarding.businessName.description")}
      </Text>
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
