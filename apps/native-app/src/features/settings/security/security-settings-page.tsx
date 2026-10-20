import { useAtomValue } from "jotai"
import { Text, YStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { RecoveryPhraseCard } from "./recovery-phrase-card.tsx"
import { TransportAddForm } from "./transport-add-form.tsx"
import { TransportList } from "./transport-list.tsx"

/** Recovery phrase and Evolu sync transports of the active account, like web's Security & Sync. */
export function SecuritySettingsPage() {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)
  const isDemo = account.demo !== null

  return (
    <Screen>
      <FadeHeader title={t("settings.security.title")} />
      <YStack gap="5">
        <RecoveryPhraseCard key={account.id} />
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.security.transports.title")}</CardTitle>
            <CardDescription>
              {t("settings.security.transports.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <YStack gap="5">
              {isDemo ? (
                <Text fontSize="sm" lineHeight="sm" color="muted-foreground">
                  {t("settings.security.transports.demo")}
                </Text>
              ) : null}
              <TransportList
                key={account.id}
                accountId={account.id}
                disabled={isDemo}
              />
              {isDemo ? null : <TransportAddForm accountId={account.id} />}
            </YStack>
          </CardContent>
          <CardFooter>
            <Text fontSize="xs" lineHeight="xs" color="muted-foreground">
              {t("settings.security.transports.footer")}
            </Text>
          </CardFooter>
        </Card>
      </YStack>
    </Screen>
  )
}
