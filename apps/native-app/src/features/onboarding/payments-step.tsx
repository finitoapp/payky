import { czechBankForDraft } from "@payky/app-shared/bank-account-codecs"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import Landmark from "lucide-react-native/icons/landmark"
import { XStack, YStack } from "tamagui"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../../components/ui/field.tsx"
import { Icon } from "../../components/ui/icon.tsx"
import { Input } from "../../components/ui/input.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

/** The optional bank account; a nonblank one turns bank transfers on. */
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
  const czechBank = czechBankForDraft(iban)
  const bank =
    czechBank === undefined
      ? undefined
      : (czechBank ?? t("settings.fiatBankAccount.iban.unknownBank"))

  return (
    <Field>
      <XStack gap="3" items="center">
        <Icon icon={Landmark} size={20} color="muted-foreground" />
        <FieldLabel>{t("onboarding.payments.iban.title")}</FieldLabel>
      </XStack>
      <YStack gap="2" ml={32}>
        <Input
          value={iban}
          disabled={pending}
          invalid={ibanError !== null}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect={false}
          onChangeText={onIbanChange}
        />
        {bank === undefined ? null : (
          <FieldDescription color="color" fontWeight="500">
            {bank}
          </FieldDescription>
        )}
        <FieldDescription>
          {t("onboarding.payments.iban.description")}
        </FieldDescription>
        <FieldError>{ibanError === null ? undefined : t(ibanError)}</FieldError>
      </YStack>
    </Field>
  )
}
