import { checkNewPin, sanitizePinInput } from "@payky/app-shared/access-form"
import { useState } from "react"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../../components/ui/field.tsx"
import { Input } from "../../../components/ui/input.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * A new PIN typed twice. The digits live in this component's state only:
 * `clear` empties them after a submit, and leaving the screen drops them. They
 * are never stored, logged or put in a query key; the one place a validated
 * PIN goes is the core action that hashes it.
 */
export function useNewPin() {
  const [pin, setPin] = useState("")
  const [repeat, setRepeat] = useState("")

  return {
    pin,
    repeat,
    check: checkNewPin(pin, repeat),
    setPin: (text: string) => setPin(sanitizePinInput(text)),
    setRepeat: (text: string) => setRepeat(sanitizePinInput(text)),
    clear: () => {
      setPin("")
      setRepeat("")
    },
  }
}

export type NewPinState = ReturnType<typeof useNewPin>

// The system keyboard must not learn the digits: no suggestions, no autofill.
const secretInput = {
  secureTextEntry: true,
  keyboardType: "number-pad",
  maxLength: 8,
  autoCapitalize: "none",
  autoCorrect: false,
  autoComplete: "off",
  spellCheck: false,
  contextMenuHidden: true,
  importantForAutofill: "no",
} as const

export function NewPinFields({
  state,
  disabled = false,
}: {
  readonly state: NewPinState
  readonly disabled?: boolean
}) {
  const { t } = useTranslation()

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>{t("access.newPin.label")}</FieldLabel>
        <Input
          {...secretInput}
          value={state.pin}
          disabled={disabled}
          invalid={state.check.invalid}
          onChangeText={state.setPin}
        />
        <FieldDescription color="muted-foreground">
          {t("access.newPin.description")}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel>{t("access.newPin.repeat")}</FieldLabel>
        <Input
          {...secretInput}
          value={state.repeat}
          disabled={disabled}
          invalid={state.check.mismatch}
          onChangeText={state.setRepeat}
        />
        <FieldError>
          {state.check.mismatch ? t("access.newPin.mismatch") : undefined}
        </FieldError>
      </Field>
    </FieldGroup>
  )
}
