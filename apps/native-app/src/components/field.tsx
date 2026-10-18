import { FieldError, FieldLabel, Field as UiField } from "./ui/field.tsx"
import { Input, type InputProps } from "./ui/input.tsx"

interface FieldProps extends Omit<InputProps, "accessibilityLabel"> {
  /** Already translated. */
  readonly label: string
  /** Already translated; shown in place of nothing when set. */
  readonly error?: string | undefined
}

/** Label, input and error text from `ui/field`; the input is announced by its label. */
export function Field({ label, error, ...input }: FieldProps) {
  return (
    <UiField>
      <FieldLabel>{label}</FieldLabel>
      <Input
        accessibilityLabel={label}
        invalid={error !== undefined}
        {...input}
      />
      <FieldError>{error}</FieldError>
    </UiField>
  )
}
