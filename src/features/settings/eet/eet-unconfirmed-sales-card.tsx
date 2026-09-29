import { Link } from "@tanstack/react-router"
import { parseISO } from "date-fns"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  unconfirmedEetReversalsQuery,
  unconfirmedEetSalesQuery,
} from "@/core/modules/eet/eet-queries.ts"
import { Integer } from "@/core/modules/shared/schema.ts"
import { EetSaleStatusBadge } from "@/features/shared/eet-sale-status.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatDateTime, formatMoney } from "@/lib/format-utils.ts"

export function EetUnconfirmedSalesCard() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: sales } = useEvoluQuery(unconfirmedEetSalesQuery)
  const { data: reversals } = useEvoluQuery(unconfirmedEetReversalsQuery)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.eet.unconfirmed.title")}</CardTitle>
        <CardDescription>
          {t("settings.eet.unconfirmed.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sales.length === 0 && reversals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.eet.unconfirmed.empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {sales.map((sale) => (
              <li key={sale.id}>
                <Link
                  to="/activity/$paymentId"
                  params={{ paymentId: sale.paymentId }}
                  className="-mx-1 flex items-center justify-between gap-3 rounded-md px-1 py-2 hover:bg-accent/50"
                  data-testid="eet-unconfirmed-sale"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {formatMoney(
                        { value: sale.amount, currency: sale.currency },
                        locale
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(parseISO(sale.saleAt), locale)}
                    </span>
                  </span>
                  <EetSaleStatusBadge sale={sale} />
                </Link>
              </li>
            ))}
            {reversals.map((reversal) => (
              <li key={reversal.id}>
                <Link
                  to="/activity/$paymentId"
                  params={{ paymentId: reversal.paymentId }}
                  className="-mx-1 flex items-center justify-between gap-3 rounded-md px-1 py-2 hover:bg-accent/50"
                  data-testid="eet-unconfirmed-reversal"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {t("settings.eet.unconfirmed.reversal", {
                        amount: formatMoney(
                          {
                            value: Integer(-reversal.amount),
                            currency: reversal.currency,
                          },
                          locale
                        ),
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(parseISO(reversal.saleAt), locale)}
                    </span>
                  </span>
                  <EetSaleStatusBadge sale={reversal} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
