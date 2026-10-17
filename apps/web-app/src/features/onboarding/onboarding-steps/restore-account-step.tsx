import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { RestoreAccountForm } from "@/features/shared/account/restore-account-form.tsx"

export function RestoreAccountStep({
  error,
  mnemonic,
  pending,
  onMnemonicChange,
  onRestore,
}: {
  readonly error: TranslationKey | null
  readonly mnemonic: string
  readonly pending: boolean
  readonly onMnemonicChange: (mnemonic: string) => void
  readonly onRestore: () => void
}) {
  return (
    <div className="[&_button[type=submit]]:w-full [&_button[type=submit]]:min-h-11">
      <RestoreAccountForm
        error={error}
        mnemonic={mnemonic}
        pending={pending}
        onMnemonicChange={onMnemonicChange}
        onRestore={onRestore}
      />
    </div>
  )
}
