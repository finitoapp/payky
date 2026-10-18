import { router } from "expo-router"
import { Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"

/** A settings destination; `title` and `value` are already translated. */
export interface SettingsRowData {
  readonly title: string
  /** The current choice, so the menu reads as a summary. */
  readonly value?: string | undefined
  readonly href: string
}

export function SettingsRow({ title, value, href }: SettingsRowData) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push(href)}
    >
      <XStack
        minH={56}
        items="center"
        gap="3"
        px="3"
        py="2"
        rounded="lg"
        borderWidth={1}
        borderColor="border-color"
      >
        <YStack flex={1}>
          <Text fontWeight="600">{title}</Text>
        </YStack>
        {value === undefined ? null : (
          <Text color="muted-foreground" numberOfLines={1} flexShrink={1}>
            {value}
          </Text>
        )}
        <Text color="muted-foreground">›</Text>
      </XStack>
    </Pressable>
  )
}
