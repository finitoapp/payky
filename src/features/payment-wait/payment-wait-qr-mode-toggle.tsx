import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"

export interface QrModeOption<Mode extends string> {
  readonly value: Mode
  readonly label: string
  readonly ariaLabel: string
  readonly disabled?: boolean
}

/**
 * The pill switch under a QR code that picks which encoding of the same
 * payment it shows — the bank QR standards on the transfer tab, the cashu,
 * universal and Lightning payloads on the bitcoin tab.
 */
export function QrModeToggle<Mode extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  readonly ariaLabel?: string
  readonly options: ReadonlyArray<QrModeOption<Mode>>
  readonly value: Mode
  readonly onChange: (mode: Mode) => void
}) {
  return (
    <ToggleGroup<Mode>
      value={[value]}
      onValueChange={(next) => {
        const [selected] = next
        const option = options.find((candidate) => candidate.value === selected)
        if (option !== undefined) onChange(option.value)
      }}
      aria-label={ariaLabel}
      variant="default"
      className="h-11 rounded-full border border-black/15 bg-background p-1 px-1.5 text-muted-foreground dark:border-white/15"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.ariaLabel}
          disabled={option.disabled}
          className="h-full min-w-12 -mx-0.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background aria-pressed:bg-foreground aria-pressed:text-background dark:data-[state=on]:bg-white dark:data-[state=on]:text-black dark:aria-pressed:bg-white dark:aria-pressed:text-black"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
