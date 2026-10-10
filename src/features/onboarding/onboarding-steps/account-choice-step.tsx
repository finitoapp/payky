import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  type AccountChoice,
  AccountTypeChoice,
} from "@/features/shared/account/account-type-choice.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export function AccountChoiceStep({
  pending,
  onSelect,
}: {
  readonly pending: boolean
  readonly onSelect: (accountType: AccountChoice) => void
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
        <AccountTypeChoice
          className="border bg-transparent shadow-none"
          pending={pending}
          onSelect={onSelect}
        />
      </CardContent>
    </>
  )
}
