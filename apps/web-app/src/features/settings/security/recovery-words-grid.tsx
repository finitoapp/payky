import { Input } from "@/components/ui/input.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The recovery phrase as 20 numbered tiles in two columns, the same look as
 * the restore grid. Read-only; the words are masked until `revealed`.
 */
export function RecoveryWordsGrid({
  words,
  revealed,
  label,
}: {
  readonly words: ReadonlyArray<string>
  readonly revealed: boolean
  readonly label: string
}) {
  const { t } = useTranslation()

  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {words.map((word, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the slots are fixed positions
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {index + 1}
          </span>
          <Input
            type={revealed ? "text" : "password"}
            value={word}
            readOnly
            aria-label={t("onboarding.restore.wordLabel", { index: index + 1 })}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>
      ))}
    </fieldset>
  )
}
