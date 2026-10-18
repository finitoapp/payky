import { Text, YStack } from "tamagui"

export interface SelectOption<Value extends string> {
  readonly value: Value
  /** Already translated. */
  readonly title: string
  readonly description?: string
}

/** A single choice among a few options, as web's `OptionToggleGroup`. */
export function OptionSelect<Value extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: Value
  readonly options: ReadonlyArray<SelectOption<Value>>
  readonly onChange: (value: Value) => void
}) {
  return (
    <YStack gap="2">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <YStack
            key={option.value}
            minH={48}
            px="3"
            py="2"
            justify="center"
            rounded="lg"
            borderWidth={selected ? 2 : 1}
            borderColor={selected ? "primary" : "border-color"}
            accessibilityRole="radio"
            accessibilityLabel={option.title}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) onChange(option.value)
            }}
          >
            <Text fontWeight={selected ? "700" : "400"}>{option.title}</Text>
            {option.description === undefined ? null : (
              <Text fontSize={13} color="muted-foreground">
                {option.description}
              </Text>
            )}
          </YStack>
        )
      })}
    </YStack>
  )
}
