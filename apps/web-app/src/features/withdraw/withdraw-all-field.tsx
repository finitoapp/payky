import type { WithdrawDestination } from "@payky/core/modules/withdraw/withdraw-destination-utils"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/** Why "Withdraw all" is off for this destination, or `null` when it is offered. */
export const withdrawAllUnavailableKey = (
  destination: WithdrawDestination | null
): TranslationKey | null =>
  destination?.kind === "lightning-invoice" && destination.amountSats !== null
    ? "withdraw.all.unavailableInvoice"
    : null

/** "Withdraw all", or why the destination does not allow it. */
export function WithdrawAllField({
  checked,
  unavailableKey,
  onChange,
}: {
  readonly checked: boolean
  readonly unavailableKey: TranslationKey | null
  readonly onChange: (withdrawAll: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Field orientation="horizontal">
      <Checkbox
        id="withdraw-all"
        checked={checked}
        disabled={unavailableKey !== null}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <FieldContent>
        <FieldLabel htmlFor="withdraw-all">
          {t("withdraw.all.label")}
        </FieldLabel>
        <FieldDescription>
          {t(unavailableKey ?? "withdraw.all.description")}
        </FieldDescription>
      </FieldContent>
    </Field>
  )
}
