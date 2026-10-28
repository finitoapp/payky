import { cashuBalancesQuery } from "@payky/core/modules/cashu/cashu-queries"
import { Text, YStack } from "tamagui"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Web's `CashuWalletDebugCard`: the balance per mint (cashu/0012). A
 * development aid, shown in development builds only, as on web.
 */
export function CashuWalletDebugCard() {
  const { t } = useTranslation()
  const { data: balances } = useEvoluQuery(cashuBalancesQuery)

  const line = (text: string, key?: string) => (
    <Text key={key} fontSize="xs" lineHeight="xs" userSelect="text">
      {text}
    </Text>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.debugConsole.cashu.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <YStack gap="1">
          {balances.length === 0
            ? line(t("settings.debugConsole.cashu.noBalance"))
            : balances.map((row) =>
                line(`${row.mintUrl}: ${row.balance} sat`, row.mintUrl)
              )}
        </YStack>
      </CardContent>
    </Card>
  )
}
