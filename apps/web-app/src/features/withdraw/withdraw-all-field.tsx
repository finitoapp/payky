import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

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
