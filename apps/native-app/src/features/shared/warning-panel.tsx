import type { ReactNode } from "react"
import { Text, YStack } from "tamagui"

/** A warning panel: title, then the facts under it. */
export function WarningPanel({
  title,
  children,
}: {
  readonly title: string
  readonly children?: ReactNode
}) {
  return (
    <YStack
      gap="2"
      p="3"
      rounded="lg"
      borderWidth={1}
      borderColor="orange-600"
      accessibilityRole="alert"
    >
      <Text fontWeight="600" color="orange-600">
        {`⚠ ${title}`}
      </Text>
      {children}
    </YStack>
  )
}
