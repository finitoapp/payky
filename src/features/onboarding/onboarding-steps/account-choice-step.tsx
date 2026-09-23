import { KeyRound, Plus } from "lucide-react"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import type { OnboardingAccountType } from "@/features/onboarding/onboarding-form-state.ts"
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

/**
 * A signpost, not a selection: picking an option leaves the step immediately,
 * so `VerticalNav` (stateless, like the settings index it is borrowed from)
 * rather than `OptionToggleGroup` — a toggle group would show the previous
 * answer as pressed when the user comes back here.
 */
export function AccountChoiceStep({
  pending,
  onSelect,
}: {
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
        <VerticalNav
          className="border bg-transparent shadow-none"
          items={accountTypeOptions.map((option) => {
            const Icon = option.icon

            return {
              id: option.value,
              kind: "button" as const,
              icon: <Icon className="text-muted-foreground" />,
              label: (
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">
                    {t(option.label)}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t(option.description)}
                  </span>
                </span>
              ),
              onClick: () => {
                if (pending) return
                onSelect(option.value)
              },
            }
          })}
        />
      </CardContent>
    </>
  )
}
