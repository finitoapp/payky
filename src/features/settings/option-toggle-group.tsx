import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"

export interface OptionToggleGroupOption<Value extends string> {
  readonly value: Value
  readonly icon?: LucideIcon
  readonly title: ReactNode
  readonly description?: ReactNode
}

interface OptionToggleGroupProps<Value extends string> {
  readonly value: Value | null
  readonly options: ReadonlyArray<OptionToggleGroupOption<Value>>
  readonly onChange: (value: Value) => void
  readonly disabled?: boolean
}

/**
 * Vertical single-select list of icon + title + description options, used by
 * the settings and onboarding pages.
 */
export function OptionToggleGroup<Value extends string>({
  value,
  options,
  onChange,
  disabled,
}: OptionToggleGroupProps<Value>) {
  return (
    <ToggleGroup<Value>
      value={value === null ? [] : [value]}
      onValueChange={(nextValue) => {
        const [nextOption] = nextValue
        if (nextOption === undefined) return

        onChange(nextOption)
      }}
      spacing={2}
      className="grid w-full grid-cols-1"
      orientation="vertical"
      variant="outline"
      disabled={disabled}
    >
      {options.map((option) => {
        const Icon = option.icon

        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="flex h-auto justify-start gap-6 px-6 py-4 text-left"
          >
            {Icon === undefined ? null : (
              <Icon className="text-muted-foreground" />
            )}
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{option.title}</span>
              {option.description === undefined ? null : (
                <span className="text-xs leading-snug text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
