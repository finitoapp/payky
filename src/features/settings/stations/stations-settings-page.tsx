import { useTimeAgo } from "@dedalik/use-react"
import { StoreIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import {
  type StationListRow,
  stationsQuery,
} from "@/core/modules/station/station-queries.ts"
import { SettingsListPage } from "@/features/settings/settings-list-page.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function StationsSettingsPage() {
  const { t } = useTranslation()
  const { data: stations } = useEvoluQuery(stationsQuery)

  return (
    <SettingsListPage
      title={t("settings.stations.title")}
      addAriaLabel={t("settings.stations.add")}
      addTo="/settings/stations/new"
    >
      <VerticalNav
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-lg font-semibold">
              {t("settings.stations.empty.title")}
            </p>
            <p className="text-balance text-sm text-muted-foreground">
              {t("settings.stations.empty.description")}
            </p>
          </div>
        }
        items={stations.map((station) => ({
          id: station.id,
          kind: "link" as const,
          to: "/settings/stations/$stationId",
          params: { stationId: station.id },
          icon: <StoreIcon className="text-muted-foreground" />,
          label: <StationListLabel station={station} />,
        }))}
      />
    </SettingsListPage>
  )
}

function StationListLabel({ station }: { readonly station: StationListRow }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const lastSeen = useTimeAgo(station.lastSeenAt, { locale })

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-2">
        <span className="truncate font-semibold">{station.name}</span>
        <span className="text-muted-foreground">#{station.number}</span>
        {station.revokedAt === null ? null : (
          <Badge variant="destructive">{t("settings.stations.revoked")}</Badge>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {station.lastSeenAt === null
          ? t("settings.stations.neverSeen")
          : t("settings.stations.lastSeen", { time: lastSeen })}
      </span>
    </span>
  )
}
