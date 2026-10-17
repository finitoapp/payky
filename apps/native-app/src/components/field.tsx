import type { ComponentProps } from "react"
import { Input, Text, YStack } from "tamagui"

interface FieldProps
  extends Omit<ComponentProps<typeof Input>, "accessibilityLabel"> {
  /** Already translated. */
  readonly label: string
  /** Already translated; shown in place of nothing when set. */
  readonly error?: string | undefined
}

/** Label, input and error text; the input is announced by its label. */
export function Field({ label, error, ...input }: FieldProps) {
  return (
    <YStack gap="1.5">
      <Text fontSize="sm" fontWeight="600">
        {label}
      </Text>
      <Input
        minH={48}
        accessibilityLabel={label}
        borderColor={error === undefined ? "border-color" : "red-600"}
        {...input}
      />
      {error === undefined ? null : (
        <Text
          fontSize="sm"
          color="red-600"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      )}
    </YStack>
  )
}
