import { Pressable } from "react-native"
import { Input, Text, XStack } from "tamagui"

/** A search box with a clear button, as web's `SearchInput`; texts are already translated. */
export function SearchField({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder: string
  readonly clearLabel: string
}) {
  return (
    <XStack items="center" gap="2">
      <Input
        flex={1}
        minH={48}
        value={value}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onChangeText={onChange}
      />
      {value === "" ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={8}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={() => onChange("")}
        >
          <Text fontSize={20}>✕</Text>
        </Pressable>
      )}
    </XStack>
  )
}
