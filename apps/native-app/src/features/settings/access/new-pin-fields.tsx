import { checkNewPin, sanitizePinInput } from "@payky/app-shared/access-form"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { Field } from "../../../components/field.tsx"
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
    <YStack gap="3">
      <Field
        {...secretInput}
        label={t("access.newPin.label")}
        value={state.pin}
        disabled={disabled}
        onChangeText={state.setPin}
      />
      <Text
        fontSize={13}
        color={state.check.invalid ? "red-600" : "muted-foreground"}
      >
        {t("access.newPin.description")}
      </Text>
      <Field
        {...secretInput}
        label={t("access.newPin.repeat")}
        value={state.repeat}
        disabled={disabled}
        error={state.check.mismatch ? t("access.newPin.mismatch") : undefined}
        onChangeText={state.setRepeat}
      />
    </YStack>
  )
}
