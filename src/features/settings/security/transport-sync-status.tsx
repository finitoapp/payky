import type { Millis } from "@evolu/common"
import type {
  RelaySyncState,
  SyncRouteErrorType,
} from "@evolu/common/local-first"
import { isSameDay } from "date-fns"
import { useAtomValue } from "jotai"
import { useSyncExternalStore } from "react"

import { runAtom } from "@/atoms/run.ts"
import { resolveTransportUrl } from "@/core/evolu/device-account.ts"
import { findRelaySyncState } from "@/features/settings/security/transport-sync-state.ts"
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
} satisfies Record<SyncRouteErrorType, TranslationKey>

const toKind = (relay: RelaySyncState | null): TransportSyncKind => {
  if (relay === null) return "connecting"
  if (relay.status !== "offline") return relay.status
  return relay.transport.readyState === "connecting" ? "connecting" : "offline"
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
      evolu.appOwner.id,
      resolveTransportUrl(url, evolu.appOwner.id)
    ),
    400
  )
  const kind = toKind(relay)
  const { label, dot } = kindPresentation[kind]

  const formatAt = (millis: Millis) => {
    const date = new Date(millis)
    return isSameDay(date, new Date())
      ? formatTime(date, locale)
      : formatDateTime(date, locale)
  }

  const detail = ((): string | null => {
    if (relay === null) return null
    const { route, transport } = relay

    switch (kind) {
      case "error":
        return route.error ? t(routeErrorKeys[route.error.type]) : null
      case "synced":
        return route.completeAt === null ? null : formatAt(route.completeAt)
      case "syncing":
        return route.completeAt === null
          ? t("settings.security.transports.status.firstSync")
          : null
      case "connecting":
      case "offline":
        if (transport.error) {
          return t("settings.security.transports.status.unreachable")
        }
        if (route.completeAt !== null) {
          return t("settings.security.transports.status.lastSynced", {
            time: formatAt(route.completeAt),
          })
        }
        return transport.closedAt === null
          ? null
          : t("settings.security.transports.status.offlineSince", {
              time: formatAt(transport.closedAt),
            })
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
