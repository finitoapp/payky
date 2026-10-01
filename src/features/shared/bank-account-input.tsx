import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import {
  czechBankNameForIban,
  czechIbanToBban,
} from "@/core/modules/shared/iban-utils.ts"
import { BankAccountInputIbanSchema } from "@/core/modules/shared/schema.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export type BankAccountDisplayFormat = "iban" | "bban"

export const formatBankAccount = {
  iban: (value: string) => value,
  // Czech accounts read as the account number people know them by; any other
  // IBAN has no such form and stays as it is.
  bban: (value: string) => czechIbanToBban(value) ?? value,
} satisfies Record<BankAccountDisplayFormat, (value: string) => string>

/**
 * The account-number / IBAN switch beside a bank account input. Switching
 * hands back the typed text converted to the other form, or `undefined` when
 * it is not a valid account yet and should stay as typed.
 */
export function BankAccountFormatToggle({
  format,
  draft,
  disabled,
  onFormatChange,
}: {
  readonly format: BankAccountDisplayFormat
  readonly draft: string
  readonly disabled?: boolean
  readonly onFormatChange: (
    format: BankAccountDisplayFormat,
    convertedDraft: string | undefined
  ) => void
}) {
  const { t } = useTranslation()

  return (
    <ToggleGroup<BankAccountDisplayFormat>
      size="sm"
      variant="outline"
      spacing={0}
      disabled={disabled}
      value={[format]}
      onValueChange={([next]) => {
        if (next === undefined) return
        const parsed = BankAccountInputIbanSchema.safeParse(draft)
        onFormatChange(
          next,
          parsed.success ? formatBankAccount[next](parsed.data) : undefined
        )
      }}
    >
      <ToggleGroupItem value="bban">
        {t("settings.fiatBankAccount.iban.format.bban")}
      </ToggleGroupItem>
      <ToggleGroupItem value="iban">
        {t("settings.fiatBankAccount.iban.format.iban")}
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/** The input hint, led by the bank a Czech account belongs to as it is typed. */
export function BankAccountDescription({ draft }: { readonly draft: string }) {
  const { t } = useTranslation()
  const parsed = BankAccountInputIbanSchema.safeParse(draft)
  const bank =
    parsed.success && parsed.data.startsWith("CZ")
      ? (czechBankNameForIban(parsed.data) ??
        t("settings.fiatBankAccount.iban.unknownBank"))
      : undefined

  return (
    <>
      {bank !== undefined && (
        <span className="block font-medium text-foreground">{bank}</span>
      )}
      {t("settings.fiatBankAccount.iban.description")}
    </>
  )
}
