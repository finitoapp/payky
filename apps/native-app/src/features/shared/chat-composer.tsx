import { useState } from "react"
import { XStack, YStack } from "tamagui"
import { Field } from "../../components/field.tsx"
import { Button } from "../../components/ui/button.tsx"

/**
 * The message field with Send (or Stop while a reply is coming); the draft is
 * this component's state only. All labels are already translated.
 */
export function ChatComposer({
  label,
  placeholder,
  sendLabel,
  disabled,
  stop,
  onSend,
}: {
  readonly label: string
  readonly placeholder: string
  readonly sendLabel: string
  readonly disabled: boolean
  readonly stop?: { readonly label: string; readonly onStop: () => void }
  readonly onSend: (text: string) => void
}) {
  const [text, setText] = useState("")
  const trimmed = text.trim()

  return (
    <XStack gap="2" items="flex-end">
      <YStack flex={1}>
        <Field
          label={label}
          placeholder={placeholder}
          value={text}
          multiline
          minH={48}
          disabled={disabled}
          onChangeText={setText}
        />
      </YStack>
      {stop === undefined ? (
        <Button
          size="lg"
          label={sendLabel}
          disabled={disabled || trimmed.length === 0}
          onPress={() => {
            onSend(trimmed)
            setText("")
          }}
        />
      ) : (
        <Button
          size="lg"
          label={stop.label}
          variant="outline"
          onPress={stop.onStop}
        />
      )}
    </XStack>
  )
}
