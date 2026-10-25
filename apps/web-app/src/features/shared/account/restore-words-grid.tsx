import {
  analyzeRestoreWords,
  detectForeignSeed,
  fillRestoreWords,
  RESTORE_WORD_COUNT,
} from "@payky/app-shared/restore-words"
import { type KeyboardEvent, useId, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Label } from "@/components/ui/label.tsx"
import { Switch } from "@/components/ui/switch.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * The 20 numbered, hidden-by-default word fields of the restore form. A pasted
 * phrase fans out over the fields; the unknown words and the completions of
 * the field being typed in are shown right under the grid.
 */
export function RestoreWordsGrid({
  words,
  disabled,
  invalid,
  onPhrasePasted,
  onWordsChange,
}: {
  readonly words: ReadonlyArray<string>
  readonly disabled: boolean
  readonly invalid: boolean
  /** Called with the raw tokens whenever more than one word arrives at once. */
  readonly onPhrasePasted: (tokens: number) => void
  readonly onWordsChange: (words: ReadonlyArray<string>) => void
}) {
  const { t } = useTranslation()
  const switchId = useId()
  const [revealed, setRevealed] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  const analysis = analyzeRestoreWords(words, activeIndex)
  // A seed from another wallet is explained once by the form, not word by word.
  const foreign = detectForeignSeed(words)
  const invalidIndexes = foreign ? [] : analysis.invalidIndexes
  const unknownWords = invalidIndexes.flatMap((index) => {
    const word = words[index]
    return word === undefined || word === "" ? [] : [word]
  })

  const focusSlot = (index: number) => {
    const input = inputs.current[index]
    input?.focus()
  }

  const write = (index: number, value: string) => {
    const fill = fillRestoreWords(words, index, value)
    onWordsChange(fill.words)
    onPhrasePasted(value.split(/[\s,;]+/u).filter((w) => w !== "").length)
    if (fill.nextIndex !== index) focusSlot(fill.nextIndex)
  }

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && words[index] !== "") {
      event.preventDefault()
      focusSlot(Math.min(index + 1, RESTORE_WORD_COUNT - 1))
    }
    if (event.key === "Backspace" && words[index] === "" && index > 0) {
      event.preventDefault()
      focusSlot(index - 1)
    }
  }

  const complete = (word: string) => {
    if (activeIndex === null) return
    const fill = fillRestoreWords(words, activeIndex, `${word} `)
    onWordsChange(fill.words)
    focusSlot(fill.nextIndex)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={switchId} className="gap-2">
          <Switch
            id={switchId}
            size="sm"
            checked={revealed}
            onCheckedChange={setRevealed}
          />
          {t("onboarding.restore.showWords")}
        </Label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("onboarding.restore.counter", {
            count: analysis.filledCount,
            total: RESTORE_WORD_COUNT,
          })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {words.map((word, index) => {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the slots are fixed positions
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <Input
                ref={(element) => {
                  inputs.current[index] = element
                }}
                type={revealed ? "text" : "password"}
                value={word}
                disabled={disabled}
                aria-label={t("onboarding.restore.wordLabel", {
                  index: index + 1,
                })}
                aria-invalid={invalid || invalidIndexes.includes(index)}
                autoComplete={index === 0 ? "current-password" : "off"}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
                onFocus={() => setActiveIndex(index)}
                onBlur={() =>
                  setActiveIndex((current) =>
                    current === index ? null : current
                  )
                }
                onChange={(event) => write(index, event.currentTarget.value)}
                onKeyDown={(event) => onKeyDown(index, event)}
              />
            </div>
          )
        })}
      </div>
      {analysis.suggestions.length > 0 ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">
            {t("onboarding.restore.suggestions")}
          </legend>
          {analysis.suggestions.map((suggestion) => (
            <Badge
              key={suggestion}
              variant="outline"
              render={
                <button
                  type="button"
                  // Keep the field focused so the click does not blur it first.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => complete(suggestion)}
                />
              }
            >
              {suggestion}
            </Badge>
          ))}
        </fieldset>
      ) : null}
      {unknownWords.length > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {t("onboarding.restore.unknownWords", {
            words: unknownWords.join(", "),
          })}
        </p>
      ) : null}
    </div>
  )
}
