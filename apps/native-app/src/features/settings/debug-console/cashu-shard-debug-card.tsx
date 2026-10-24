import type { CashuShardStore } from "@payky/core/cashu/cashu-shard-store"
import { sumAvailableByMint } from "@payky/core/modules/cashu/cashu-queries"
import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { Text, XStack, YStack } from "tamagui"
import { cashuShardStoreAtom } from "../../../atoms/cashu.ts"
import { Button } from "../../../components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"

const loadSnapshot = async (store: CashuShardStore) => ({
  activeIndex: await store.activeIndex(),
  hydrated: store.isHydrated(),
  balances: [...sumAvailableByMint(await store.loadProofs())],
})

/**
 * Web's `CashuShardDebugCard`: what Payky sees of the Cashu wallet it shares
 * with Linky — the active shard, whether the Linky owners are hydrated, the
 * balance per mint. A development aid for checking sync against Linky
 * (cashu.md, phase 1), shown in development builds only, as on web.
 */
export function CashuShardDebugCard() {
  const { t } = useTranslation()
  const store = useAtomValue(cashuShardStoreAtom)
  const snapshot = useQuery({
    queryKey: ["cashuShardDebug", store.linkyAppOwner.id],
    queryFn: () => loadSnapshot(store),
  })
  const { refetch } = snapshot

  useEffect(() => {
    const stopChanges = store.subscribe(() => void refetch())
    const stopHydration = store.subscribeHydration(() => void refetch())
    return () => {
      stopChanges()
      stopHydration()
    }
  }, [store, refetch])

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
        {snapshot.data ? (
          <YStack gap="1">
            {line(
              t("settings.debugConsole.cashu.activeShard", {
                index: String(snapshot.data.activeIndex),
              })
            )}
            {line(
              t("settings.debugConsole.cashu.hydrated", {
                hydrated: String(snapshot.data.hydrated),
              })
            )}
            {/* Phase 1's write check: the row must show up in Linky's
                synced store. A throwaway key Linky's settings ignore. */}
            <XStack>
              <Button
                variant="outline"
                size="sm"
                label={t("settings.debugConsole.cashu.writeTestSetting")}
                onPress={() => {
                  void store.writeSetting(
                    "paykyWriteCheck",
                    new Date().toISOString()
                  )
                }}
              />
            </XStack>
            {snapshot.data.balances.length === 0
              ? line(t("settings.debugConsole.cashu.noBalance"))
              : snapshot.data.balances.map(([mint, sats]) =>
                  line(`${mint}: ${sats} sat`, mint)
                )}
          </YStack>
        ) : null}
      </CardContent>
    </Card>
  )
}
