import { AlertTriangleIcon } from "lucide-react"

import type { TimestampMs } from "@/core/modules/shared/schema.ts"
import type { StationListRow } from "@/core/modules/station/station-queries.ts"
import { stationReportChainQuery } from "@/core/modules/station/station-queries.ts"
import {
  analyzeStationReportChain,
  type StationReportChainAnalysis,
} from "@/core/modules/station/station-report-utils.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * What the reports a station delivered say about it: when the newest one
 * arrived, and the gaps, broken links and conflicts in their chain
 * (station/0004). Station settings and the PoS overview both show it.
 */
export function useStationReportStatus(
  station: Pick<StationListRow, "id" | "reportedLastSeq">
): {
  readonly lastReportAt: TimestampMs | null
  readonly chain: StationReportChainAnalysis
} {
  const { data: reports } = useEvoluQuery(stationReportChainQuery(station.id))

  return {
    lastReportAt: reports.reduce<TimestampMs | null>(
      (latest, report) =>
        latest === null || report.receivedAt > latest
          ? report.receivedAt
          : latest,
      null
    ),
    chain: analyzeStationReportChain(reports, station.reportedLastSeq),
  }
}

/** The chain's problems as sentences, one per kind. */
export function useStationChainWarnings(
  chain: StationReportChainAnalysis
): ReadonlyArray<string> {
  const { t } = useTranslation()
  const missing = chain.missingRanges
    .map(({ from, to }) => (from === to ? `#${from}` : `#${from}–${to}`))
    .join(", ")
  const seqs = (values: ReadonlyArray<number>) =>
    values.map((seq) => `#${seq}`).join(", ")

  return [
    missing === ""
      ? null
      : t("activity.stations.warning.missing", { reports: missing }),
    chain.brokenLinkSeqs.length === 0
      ? null
      : t("activity.stations.warning.brokenLinks", {
          reports: seqs(chain.brokenLinkSeqs),
        }),
    chain.conflictSeqs.length === 0
      ? null
      : t("activity.stations.warning.conflicts", {
          reports: seqs(chain.conflictSeqs),
        }),
  ].filter((warning) => warning !== null)
}

export function StationWarnings({
  warnings,
}: {
  readonly warnings: ReadonlyArray<string>
}) {
  if (warnings.length === 0) return null

  return (
    <ul className="flex flex-col gap-1 text-sm text-warning">
      {warnings.map((warning) => (
        <li key={warning} className="flex items-start gap-2">
          <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {warning}
        </li>
      ))}
    </ul>
  )
}
