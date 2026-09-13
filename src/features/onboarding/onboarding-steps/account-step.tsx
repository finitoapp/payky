import { useAtomValue } from "jotai"
import { useId, useState } from "react"

import { accountAtom, recoveryMnemonicAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { updateAccountName } from "@/core/evolu/device-account.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { RecoveryPhraseCard } from "@/features/settings/security/recovery-phrase-card.tsx"
import { TransportToggleList } from "@/features/settings/security/transport-toggle-list.tsx"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function AccountStep({
  recoveryPhraseConfirmed,
  onRecoveryPhraseConfirmedChange,
}: {
  readonly recoveryPhraseConfirmed: boolean
  readonly onRecoveryPhraseConfirmedChange: (confirmed: boolean) => void
}) {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)
  const recoveryMnemonic = useAtomValue(recoveryMnemonicAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const [name, setName] = useState(account.name)
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const formId = useId()

  const saveName = async () => {
    const trimmedName = name.trim()

    if (trimmedName === "") {
      setName(account.name)
      setNameError("onboarding.account.name.error.required")
      return
    }

    setNameError(null)

    if (trimmedName === account.name) {
      return
    }

    await runMutationWithCompletion((options) =>
      updateAccountName(deviceEvolu, account.id, trimmedName, options)
    )
    reloadAppEvolu()
  }

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.account.title")}</CardTitle>
        <CardDescription>{t("onboarding.account.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <FieldGroup>
            <Field data-invalid={nameError !== null}>
              <FieldLabel htmlFor={`${formId}-name`}>
                {t("onboarding.account.name.label")}
              </FieldLabel>
              <Input
                id={`${formId}-name`}
                value={name}
                aria-invalid={nameError !== null}
                autoComplete="off"
                onChange={(event) => {
                  setName(event.currentTarget.value)
                  setNameError(null)
                }}
                onBlur={() => {
                  void saveName()
                }}
              />
              <FieldDescription>
                {t("onboarding.account.name.description")}
              </FieldDescription>
              <FieldError>{nameError ? t(nameError) : null}</FieldError>
            </Field>
          </FieldGroup>

          <RecoveryPhraseCard mnemonic={recoveryMnemonic} />

          <Field orientation="horizontal">
            <Checkbox
              id={`${formId}-recoveryPhraseConfirm`}
              checked={recoveryPhraseConfirmed}
              onCheckedChange={onRecoveryPhraseConfirmedChange}
            />
            <FieldContent>
              <FieldLabel htmlFor={`${formId}-recoveryPhraseConfirm`}>
                {t("onboarding.account.mnemonic.confirm")}
              </FieldLabel>
            </FieldContent>
          </Field>

          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.account.transport.title")}</CardTitle>
              <CardDescription>
                {t("onboarding.account.transport.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TransportToggleList accountId={account.id} />
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </>
  )
}
