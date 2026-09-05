import {
  hasTaxableLines,
  type TaxRecapRow,
} from "@/core/modules/bill-line/bill-line-tax-utils.ts"
import { type Currency, Integer } from "@/core/modules/shared/schema.ts"
import { taxRatePercentageToDecimalString } from "@/core/modules/tax-rate/tax-rate-utils.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

/**
 * VAT breakdown by tax rate — base/tax/gross per rate used on the bill.
 * Renders nothing if every line has no tax rate at all (a non-VAT-payer
 * tenant, or a bill with no taxed items), since the plain total shown
 * elsewhere on the page already covers that case.
 */
export function TaxRecap({
  rows,
  currency,
  locale,
}: {
  readonly rows: ReadonlyArray<TaxRecapRow>
  readonly currency: Currency
  readonly locale: string
}) {
  const { t } = useTranslation()

  if (!hasTaxableLines(rows)) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground">
        {t("taxRecap.title")}
      </p>
      <div className="flex flex-col divide-y">
        {rows.map((row) => (
          <div
            key={row.taxRateId ?? "none"}
            className="flex items-center justify-between gap-2 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {row.name === null || row.ratePercentage === null
                  ? t("taxRecap.noTax")
                  : t("taxRecap.rateLabel", {
                      name: row.name,
                      rate: taxRatePercentageToDecimalString(
                        row.ratePercentage
                      ),
                    })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("taxRecap.base")}:{" "}
                {formatMoney(
                  { value: Integer(row.baseAmount), currency },
                  locale
                )}
                {" · "}
                {t("taxRecap.tax")}:{" "}
                {formatMoney(
                  { value: Integer(row.taxAmount), currency },
                  locale
                )}
              </p>
            </div>
            <p className="text-sm font-semibold">
              {formatMoney(
                { value: Integer(row.grossAmount), currency },
                locale
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
