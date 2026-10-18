import type { Millis } from "@evolu/common"
import { relaySyncStateToStatus } from "@evolu/common/local-first"
import {
  findRelaySyncState,
  type TransportSyncKind,
  toTransportSyncKind,
  transportRouteErrorKeys,
  transportSyncKindLabels,
} from "@payky/app-shared/evolu-transports"
import { resolveTransportUrl } from "@payky/core/evolu/device-account"
import { isSameDay } from "date-fns"
import { useAtomValue } from "jotai"
import { useSyncExternalStore } from "react"
import { runAtom } from "@/atoms/run.ts"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime, formatTime } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

const kindDots = {
  synced: "bg-success",
  syncing: "bg-info animate-pulse motion-reduce:animate-none",
  connecting: "bg-warning animate-pulse motion-reduce:animate-none",
  offline: "bg-muted-foreground",
  error: "bg-destructive",
} satisfies Record<TransportSyncKind, string>

interface TransportSyncStatusProps {
  readonly url: string
}

/**
 * One line with the live sync status of an active transport of the app
 * database — a dot, the state, and what matters about it right now — read
 * from Evolu's shared-worker `syncState`.
 */
export function TransportSyncStatus({ url }: TransportSyncStatusProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const evolu = useEvolu()
  const { syncState } = useAtomValue(runAtom).deps
  const state = useSyncExternalStore(syncState.subscribe, syncState.get)
  // Every write flips a synced relay to syncing and back within moments;
  // settling the snapshot keeps the line from flickering.
  const relay = useDebouncedValue(
    findRelaySyncState(
      state,
      evolu.name,
      evolu.appOwner.id,
      resolveTransportUrl(url, evolu.appOwner.id)
    ),
    400
  )
  const status = relay === null ? null : relaySyncStateToStatus(relay)
  const kind = toTransportSyncKind(relay, status)
  const label = transportSyncKindLabels[kind]
  const dot = kindDots[kind]

  const formatAt = (millis: Millis) => {
    const date = new Date(millis)
    return isSameDay(date, new Date())
      ? formatTime(date, locale)
      : formatDateTime(date, locale)
  }

  const detail = ((): string | null => {
    if (relay === null) return null
    const { route } = relay
    const { connection } = relay.transport

    switch (kind) {
      case "error":
        return status?.type === "Error"
          ? t(transportRouteErrorKeys[status.error.type])
          : null
      case "synced":
        return route.completeAt === null ? null : formatAt(route.completeAt)
      case "syncing":
        return route.completeAt === null
          ? t("settings.security.transports.status.firstSync")
          : null
      case "connecting":
      case "offline":
        if (connection.type !== "Connecting" && connection.error !== null) {
          return t("settings.security.transports.status.unreachable")
        }
        if (route.completeAt !== null) {
          return t("settings.security.transports.status.lastSynced", {
            time: formatAt(route.completeAt),
          })
        }
        return connection.type === "Disconnected"
          ? t("settings.security.transports.status.offlineSince", {
              time: formatAt(connection.disconnectedAt),
            })
          : null
    }
  })()

  return (
    <p
      className={cn(
        "text-xs",
        kind === "error" ? "text-destructive" : "text-muted-foreground"
      )}
    >
      <span
        aria-hidden="true"
        className={cn("mr-1.5 inline-block size-2 rounded-full", dot)}
      />
      <span
        className={cn(
          "font-medium",
          kind === "error" ? "text-destructive" : "text-foreground"
        )}
      >
        {t(label)}
      </span>
      {detail === null ? null : ` · ${detail}`}
    </p>
  )
}
