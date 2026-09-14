import type { ReactNode } from "react"
import { useId, useState } from "react"
import { z } from "zod"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import {
  InlineEditSavedTick,
  useInlineSave,
} from "@/features/settings/inline-edit-save.tsx"

interface InlineEditSelectOption {
  readonly value: string
  readonly label: string
}

interface InlineEditSelectProps<T extends string | number | null> {
  readonly label: string
  readonly description?: ReactNode
  /** Current stored value. Re-renders flow straight through while idle. */
  readonly defaultValue: T
  /** See `InlineEditField`; the option values are this codec's input side. */
  readonly codec: z.core.$ZodType<T, string>
  readonly options: ReadonlyArray<InlineEditSelectOption>
  /** Rejects to report a failed save; the field toasts and shows no tick. */
  readonly onSave: (value: T) => Promise<void>
}

/**
 * A single select that saves itself.
 *
 * Unlike `InlineEditField` there is no edit mode to finish: picking an
 * option is the confirmation, and every option is valid by construction, so
 * the choice saves straight away. A save keeps the picked option on screen
 * until `onSave` resolves, then shows the same tick.
 */
export function InlineEditSelect<T extends string | number | null>({
  label,
  description,
  defaultValue,
  codec,
  options,
  onSave,
}: InlineEditSelectProps<T>) {
  const id = useId()
  const { justSaved, save } = useInlineSave(onSave)
  // Holds the picked option until the save lands, so the select never flashes
  // the stored value back between choosing and Evolu catching up — and, being
  // set for exactly that window, it is also what "a save is in flight" means.
  const [picked, setPicked] = useState<string | null>(null)
  const saving = picked !== null

  const handleValueChange = async (next: string | null) => {
    if (next === null) return

    // Every option value comes from `options`, so this cannot realistically
    // fail; a decode error here is a wrong codec, not bad user input.
    const parsed = z.safeDecode(codec, next)
    if (!parsed.success || parsed.data === defaultValue) return

    setPicked(next)
    await save(parsed.data)
    setPicked(null)
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Select<string>
          items={Object.fromEntries(
            options.map((option) => [option.value, option.label])
          )}
          value={picked ?? z.encode(codec, defaultValue)}
          onValueChange={(next) => {
            void handleValueChange(next)
          }}
        >
          <SelectTrigger
            id={id}
            disabled={saving}
            // The `Field` stretches its direct children, which here is the
            // wrapper the tick is positioned against, not the trigger.
            className="w-full"
          >
            <SelectValue />
            {/* Room for the tick between the value and the trigger's own
                chevron. Padding would move the chevron along with it. */}
            {justSaved && <span aria-hidden className="w-6 shrink-0" />}
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {justSaved && <InlineEditSavedTick className="right-6" />}
      </div>
      {description !== undefined && (
        <FieldDescription>{description}</FieldDescription>
      )}
    </Field>
  )
}
