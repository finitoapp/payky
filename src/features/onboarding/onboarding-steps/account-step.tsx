import { useAtomValue } from "jotai"
import { useId } from "react"

import { recoveryMnemonicAtom } from "@/atoms/account.ts"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { RecoveryPhraseFields } from "@/features/settings/security/recovery-phrase-card.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * The last step does one thing: hand over the recovery phrase and make the
 * merchant acknowledge it. The account name and the sync relays used to live
 * here too; both have sensible defaults and belong in Settings, where they
 * can be changed at any time — unlike the phrase, which is only shown to a
 * fresh account once.
 */
export function AccountStep({
  recoveryPhraseConfirmed,
  recoveryPhraseError,
  onRecoveryPhraseConfirmedChange,
}: {
  readonly recoveryPhraseConfirmed: boolean
  readonly recoveryPhraseError: TranslationKey | null
  readonly onRecoveryPhraseConfirmedChange: (confirmed: boolean) => void
}) {
  const { t } = useTranslation()
  const recoveryMnemonic = useAtomValue(recoveryMnemonicAtom)
  const confirmInputId = useId()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.account.title")}</CardTitle>
        <CardDescription>{t("onboarding.account.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <RecoveryPhraseFields mnemonic={recoveryMnemonic} />

          <Field
            orientation="horizontal"
            data-invalid={recoveryPhraseError !== null}
          >
            <Checkbox
              id={confirmInputId}
              checked={recoveryPhraseConfirmed}
              aria-invalid={recoveryPhraseError !== null}
              onCheckedChange={onRecoveryPhraseConfirmedChange}
            />
            <FieldContent>
              <FieldLabel htmlFor={confirmInputId}>
                {t("onboarding.account.mnemonic.confirm")}
              </FieldLabel>
              <FieldError>
                {recoveryPhraseError ? t(recoveryPhraseError) : null}
              </FieldError>
            </FieldContent>
          </Field>
        </div>
      </CardContent>
    </>
  )
}
