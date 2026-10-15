import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import type { LnurlPayMetadata } from "@/core/integrations/lnurl/lnurl-pay-client.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatSatsAmount } from "@/lib/format-utils.ts"
import type { useBtcFiat } from "./use-btc-fiat.ts"
import { draftAmountSats, type WithdrawDraft } from "./withdraw-flow.ts"

/**
 * The amount in sats or the fiat currency, with what it comes to in the
 * other, the Lightning address's range, the on-chain minimum when one
 * applies, and what the wallet holds. An invoice's own amount replaces it.
 */
export function WithdrawAmountField({
  draft,
  onChange,
  fiat,
  invoiceAmountSats,
  range,
  withdrawAll,
  onchainMinimumSats,
  availableSats,
}: {
  readonly draft: WithdrawDraft
  readonly onChange: (patch: Partial<WithdrawDraft>) => void
  readonly fiat: ReturnType<typeof useBtcFiat>
  readonly invoiceAmountSats: number | null
  readonly range: Pick<
    LnurlPayMetadata,
    "minSendableSats" | "maxSendableSats"
  > | null
  readonly withdrawAll: boolean
  /** Set for an on-chain destination. */
  readonly onchainMinimumSats: number | null
  readonly availableSats: number | null
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const sats = (amount: number) => formatSatsAmount(amount, locale)
  const typedSats = draftAmountSats(draft, fiat)
  const outOfRange =
    range !== null &&
    !withdrawAll &&
    typedSats !== null &&
    (typedSats < range.minSendableSats || typedSats > range.maxSendableSats)
  const belowOnchainMinimum =
    onchainMinimumSats !== null &&
    !withdrawAll &&
    typedSats !== null &&
    typedSats < onchainMinimumSats
  const equivalent =
    typedSats === null
      ? null
      : draft.unit === "sats"
        ? fiat.approx(typedSats)
        : t("withdraw.sats", { amount: sats(typedSats) })

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor="withdraw-amount">
          {t("withdraw.amount.label")}
        </FieldLabel>
        {invoiceAmountSats === null ? (
          <ToggleGroup<WithdrawDraft["unit"]>
            value={[draft.unit]}
            onValueChange={([unit]) => {
              if (unit) onChange({ unit, amount: "" })
            }}
            variant="outline"
            size="sm"
            aria-label={t("withdraw.amount.unit")}
            disabled={withdrawAll}
          >
            <ToggleGroupItem value="sats">
              {t("withdraw.amount.unitSats")}
            </ToggleGroupItem>
            <ToggleGroupItem value="fiat" disabled={fiat.rate === null}>
              {fiat.currency}
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>
      <Input
        id="withdraw-amount"
        inputMode={draft.unit === "sats" ? "numeric" : "decimal"}
        disabled={withdrawAll || invoiceAmountSats !== null}
        aria-invalid={outOfRange || belowOnchainMinimum}
        value={
          invoiceAmountSats !== null ? String(invoiceAmountSats) : draft.amount
        }
        placeholder={
          draft.unit === "sats"
            ? t("withdraw.amount.placeholder")
            : t("withdraw.amount.placeholderFiat", {
                currency: fiat.currency,
              })
        }
        onChange={(event) => onChange({ amount: event.target.value })}
      />
      {invoiceAmountSats !== null ? (
        <FieldDescription>
          {t("withdraw.amount.fromInvoice")} {fiat.approx(invoiceAmountSats)}
        </FieldDescription>
      ) : equivalent !== null && !withdrawAll ? (
        <FieldDescription>{equivalent}</FieldDescription>
      ) : null}
      {range !== null ? (
        <FieldDescription
          className={outOfRange ? "text-destructive" : undefined}
        >
          {t("withdraw.amount.range", {
            min: sats(range.minSendableSats),
            max: sats(range.maxSendableSats),
          })}
        </FieldDescription>
      ) : null}
      {onchainMinimumSats !== null ? (
        <FieldDescription
          className={belowOnchainMinimum ? "text-destructive" : undefined}
        >
          {t("withdraw.amount.onchainMinimum", {
            amount: sats(onchainMinimumSats),
          })}
        </FieldDescription>
      ) : null}
      {availableSats !== null ? (
        <FieldDescription>
          {t("withdraw.amount.available", { amount: sats(availableSats) })}{" "}
          {fiat.approx(availableSats)}
        </FieldDescription>
      ) : null}
    </Field>
  )
}
