import { useTranslation } from "@/hooks/use-translation.ts"
import { formatSatsAmount } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"
import { useBtcFiat } from "./use-btc-fiat.ts"

/** The amount, with its fiat equivalent when a rate is known. */
export function SatsWithFiat({
  sats,
  locale,
  align = "end",
}: {
  readonly sats: number
  readonly locale: string
  /** `end` for a value in a detail row, `start` for a heading. */
  readonly align?: "start" | "end"
}) {
  const { t } = useTranslation()
  const fiat = useBtcFiat()
  const approx = fiat.approx(sats)
  return (
    <span
      className={cn(
        "flex flex-col",
        align === "end" ? "items-end" : "items-start"
      )}
    >
      <span>
        {t("withdraw.sats", { amount: formatSatsAmount(sats, locale) })}
      </span>
      {approx === null ? null : (
        <span className="text-xs font-normal text-muted-foreground">
          {approx}
        </span>
      )}
    </span>
  )
}
