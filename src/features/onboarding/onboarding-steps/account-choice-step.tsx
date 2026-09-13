import { KeyRound, Plus } from "lucide-react"

import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import type { OnboardingAccountType } from "@/features/onboarding/onboarding-form-state.ts"
import { OptionToggleGroup } from "@/features/settings/option-toggle-group.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

interface AccountTypeOption {
  readonly value: OnboardingAccountType
  readonly label: TranslationKey
  readonly description: TranslationKey
  readonly icon: typeof Plus
}

const accountTypeOptions: ReadonlyArray<AccountTypeOption> = [
  {
    value: "new",
    label: "onboarding.accountChoice.new.title",
    description: "onboarding.accountChoice.new.description",
    icon: Plus,
  },
  {
    value: "restore",
    label: "onboarding.accountChoice.restore.title",
    description: "onboarding.accountChoice.restore.description",
    icon: KeyRound,
  },
]

export function AccountChoiceStep({
  accountType,
  pending,
  onSelect,
}: {
  readonly accountType: OnboardingAccountType | null
  readonly pending: boolean
  readonly onSelect: (accountType: OnboardingAccountType) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("onboarding.accountChoice.title")}</CardTitle>
        <CardDescription>
          {t("onboarding.accountChoice.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OptionToggleGroup
          value={accountType}
          options={accountTypeOptions.map((option) => ({
            value: option.value,
            icon: option.icon,
            title: t(option.label),
            description: t(option.description),
          }))}
          disabled={pending}
          onChange={onSelect}
        />
      </CardContent>
    </>
  )
}
