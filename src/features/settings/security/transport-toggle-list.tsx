import { type KyselyNotNull, sqliteFalse, sqliteTrue } from "@evolu/common"
import { useAtomValue, useSetAtom } from "jotai"
import { Power, PowerOff } from "lucide-react"
import { useState } from "react"

import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { evoluCounterAtom } from "@/atoms/evolu-counter.ts"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  type AccountId,
  createDeviceQuery,
} from "@/core/evolu/device-client.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/utils.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export const accountTransportsQuery = (accountId: AccountId) =>
  createDeviceQuery((db) =>
    db
      .selectFrom("accountEvoluTransport")
      .innerJoin(
        "accountEvoluTransportWebsocket",
        "accountEvoluTransportWebsocket.id",
        "accountEvoluTransport.id"
      )
      .select([
        "accountEvoluTransport.id as id",
        "accountEvoluTransport.type as type",
        "accountEvoluTransport.isActive as isActive",
        "accountEvoluTransportWebsocket.url as url",
      ])
      .where("accountEvoluTransport.accountId", "=", accountId)
      .where("accountEvoluTransport.isDeleted", "is not", sqliteTrue)
      .where("accountEvoluTransport.isActive", "is not", null)
      .where("accountEvoluTransportWebsocket.isDeleted", "is not", sqliteTrue)
      .where("accountEvoluTransportWebsocket.url", "is not", null)
      .orderBy("accountEvoluTransport.createdAt", "desc")
      .$narrowType<{
        isActive: KyselyNotNull
        url: KyselyNotNull
      }>()
  )

export interface TransportToggleListProps {
  readonly accountId: AccountId
}

export function TransportToggleList({ accountId }: TransportToggleListProps) {
  const { t } = useTranslation()
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const setEvoluCounter = useSetAtom(evoluCounterAtom)
  const { data: transports } = useDeviceEvoluQuery(
    accountTransportsQuery(accountId)
  )
  const [pendingTransportId, setPendingTransportId] = useState<string | null>(
    null
  )

  if (transports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("settings.security.transports.empty")}
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {transports.map((transport) => (
        <TransportListItem
          key={transport.id}
          isActive={transport.isActive}
          pendingTransportId={pendingTransportId}
          url={transport.url}
          onToggle={async (isActive) => {
            setPendingTransportId(transport.id)
            try {
              await runMutationWithCompletion((options) =>
                deviceEvolu.update(
                  "accountEvoluTransport",
                  {
                    id: transport.id,
                    isActive,
                  },
                  options
                )
              )
              setEvoluCounter((current) => current + 1)
            } finally {
              setPendingTransportId(null)
            }
          }}
        />
      ))}
    </ul>
  )
}

interface TransportListItemProps {
  readonly isActive: 0 | 1
  readonly pendingTransportId: string | null
  readonly url: string
  readonly onToggle: (isActive: 0 | 1) => void
}

function TransportListItem({
  isActive,
  pendingTransportId,
  url,
  onToggle,
}: TransportListItemProps) {
  const { t } = useTranslation()
  const active = isActive === sqliteTrue
  const Icon = active ? PowerOff : Power

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">
          {t("settings.security.transports.websocket")}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground">
          {url}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={active ? "secondary" : "outline"}>
          {active
            ? t("settings.security.transports.active")
            : t("settings.security.transports.inactive")}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendingTransportId !== null}
          onClick={() => {
            onToggle(active ? sqliteFalse : sqliteTrue)
          }}
        >
          <Icon data-icon="inline-start" />
          {active
            ? t("settings.security.transports.deactivate")
            : t("settings.security.transports.activate")}
        </Button>
      </div>
    </li>
  )
}
