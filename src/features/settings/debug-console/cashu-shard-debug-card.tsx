import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { cashuShardStoreAtom } from "@/atoms/evolu.ts"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import type { CashuShardStore } from "@/core/cashu/cashu-shard-store.ts"
import { sumAvailableByMint } from "@/core/modules/cashu/cashu-queries.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

const loadSnapshot = async (store: CashuShardStore) => ({
  activeIndex: await store.activeIndex(),
  hydrated: store.isHydrated(),
  balances: [...sumAvailableByMint(await store.loadProofs())],
})

/**
 * What Payky sees of the Cashu wallet it shares with Linky: the active
 * shard, whether the Linky owners are hydrated, the balance per mint. A
 * development aid for checking sync against Linky (cashu.md, phase 1).
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

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>{t("settings.debugConsole.cashu.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 font-mono text-xs">
        {snapshot.data ? (
          <>
            <p>
              {t("settings.debugConsole.cashu.activeShard", {
                index: String(snapshot.data.activeIndex),
              })}
            </p>
            <p>
              {t("settings.debugConsole.cashu.hydrated", {
                hydrated: String(snapshot.data.hydrated),
              })}
            </p>
            {/* Phase 1's write check: the row must show up in Linky's
                synced store. A throwaway key Linky's settings ignore. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void store.writeSetting(
                  "paykyWriteCheck",
                  new Date().toISOString()
                )
              }}
            >
              {t("settings.debugConsole.cashu.writeTestSetting")}
            </Button>
            {snapshot.data.balances.length === 0 ? (
              <p>{t("settings.debugConsole.cashu.noBalance")}</p>
            ) : (
              snapshot.data.balances.map(([mint, sats]) => (
                <p key={mint}>
                  {mint}: {sats} sat
                </p>
              ))
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
