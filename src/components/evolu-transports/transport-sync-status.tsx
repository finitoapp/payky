import type { Millis } from "@evolu/common"
import {
  type RelaySyncState,
  type RelaySyncStatus,
  relaySyncStateToStatus,
  type SyncRouteError,
} from "@evolu/common/local-first"
import { isSameDay } from "date-fns"
import { useAtomValue } from "jotai"
import { useSyncExternalStore } from "react"

import { runAtom } from "@/atoms/run.ts"
import { findRelaySyncState } from "@/components/evolu-transports/transport-sync-state.ts"
import { resolveTransportUrl } from "@/core/evolu/device-account.ts"
import { useDebouncedValue } from "@/hooks/use-debounced-value.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/en.ts"
import { formatDateTime, formatTime } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type TransportSyncKind =
  | "synced"
  | "syncing"
  | "connecting"
  | "offline"
  | "error"

const kindPresentation = {
  synced: {
    label: "settings.security.transports.status.synced",
    dot: "bg-success",
  },
  syncing: {
    label: "settings.security.transports.status.syncing",
    dot: "bg-info animate-pulse motion-reduce:animate-none",
  },
  connecting: {
    label: "settings.security.transports.status.connecting",
    dot: "bg-warning animate-pulse motion-reduce:animate-none",
  },
  offline: {
    label: "settings.security.transports.status.offline",
    dot: "bg-muted-foreground",
  },
  error: {
    label: "settings.security.transports.status.error",
    dot: "bg-destructive",
  },
} satisfies Record<
  TransportSyncKind,
  { readonly label: TranslationKey; readonly dot: string }
>

const routeErrorKeys = {
  ProtocolVersionError: "settings.security.transports.status.errors.version",
  ProtocolWriteKeyError: "settings.security.transports.status.errors.writeKey",
  ProtocolQuotaError: "settings.security.transports.status.errors.quota",
  StorageQuotaError: "settings.security.transports.status.errors.quota",
  UnknownError: "settings.security.transports.status.errors.generic",
  ProtocolChangeTooLargeError:
    "settings.security.transports.status.errors.generic",
  DecryptWithXChaCha20Poly1305Error:
    "settings.security.transports.status.errors.decrypt",
  ProtocolInvalidDataError:
    "settings.security.transports.status.errors.generic",
  ProtocolWriteError: "settings.security.transports.status.errors.generic",
  ProtocolSyncError: "settings.security.transports.status.errors.generic",
  ProtocolTimestampMismatchError:
    "settings.security.transports.status.errors.generic",
  WriteFailed: "settings.security.transports.status.errors.generic",
  SyncFailed: "settings.security.transports.status.errors.generic",
} satisfies Record<SyncRouteError["type"], TranslationKey>

/** Evolu's `Syncing` covers a first connection too, which this line tells apart. */
const toKind = (
  relay: RelaySyncState | null,
  status: RelaySyncStatus | null
): TransportSyncKind => {
  if (relay === null || status === null) return "connecting"
  switch (status.type) {
    case "Error":
      return "error"
    case "Synced":
      return "synced"
    case "Offline":
      return "offline"
    case "Syncing":
      return relay.transport.connection.type === "Connecting"
        ? "connecting"
        : "syncing"
  }
}

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
  const kind = toKind(relay, status)
  const { label, dot } = kindPresentation[kind]

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
          ? t(routeErrorKeys[status.error.type])
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
