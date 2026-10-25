import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { RestoreAccountForm } from "@/features/shared/account/restore-account-form.tsx"

export function RestoreAccountStep({
  error,
  words,
  pending,
  onWordsChange,
  onRestore,
  onTransfer,
}: {
  readonly error: TranslationKey | null
  readonly words: ReadonlyArray<string>
  readonly pending: boolean
  readonly onWordsChange: (words: ReadonlyArray<string>) => void
  readonly onRestore: () => void
  readonly onTransfer: () => void
}) {
  return (
    <div className="[&_button[type=submit]]:w-full [&_button[type=submit]]:min-h-11">
      <RestoreAccountForm
        error={error}
        words={words}
        pending={pending}
        onWordsChange={onWordsChange}
        onRestore={onRestore}
        onTransfer={onTransfer}
      />
    </div>
  )
}
