import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { WithdrawMethod } from "@payky/app-shared/withdraw-flow"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

const noAccountKeys = {
  spark: {
    title: "withdraw.noAccount.title",
    description: "withdraw.noAccount.description",
  },
  cashu: {
    title: "withdraw.cashu.noAccount.title",
    description: "withdraw.cashu.noAccount.description",
  },
} satisfies Record<
  WithdrawMethod,
  { readonly title: TranslationKey; readonly description: TranslationKey }
>

/** Web `apps/web-app/src/features/withdraw/withdraw-account.tsx`. */
export function WithdrawNoAccountCard({
  method,
}: {
  readonly method: WithdrawMethod
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(noAccountKeys[method].title)}</CardTitle>
        <CardDescription>
          {t(noAccountKeys[method].description)}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
