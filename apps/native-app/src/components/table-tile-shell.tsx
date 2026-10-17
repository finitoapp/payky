import type { ReactNode } from "react"
import { Text, YStack } from "tamagui"

/**
 * The visual shell of every table tile (the overview grid and the bill's
 * table picker), as web's `TableTileShell`: occupancy is the whole surface,
 * so a free table stays bare and an occupied one is outlined, with the info
 * tone for one that needs a look (`attention`). Takes a plain name/subtitle
 * so no table row is needed.
 */
export function TableTileShell({
  name,
  subtitle,
  occupied,
  attention = false,
  selected = false,
  children,
}: {
  /** Already translated or user-entered. */
  readonly name: string
  readonly subtitle?: string
  readonly occupied: boolean
  readonly attention?: boolean
  readonly selected?: boolean
  readonly children: ReactNode
}) {
  return (
    <YStack
      flex={1}
      minH={112}
      p="3"
      gap="2"
      rounded="xl"
      borderWidth={selected ? 3 : 1}
      borderColor={
        selected
          ? "primary"
          : occupied
            ? attention
              ? "blue-600"
              : "primary"
            : "border-color"
      }
      bg={occupied ? "card" : "transparent"}
    >
      <Text fontSize={17} fontWeight="600" numberOfLines={1}>
        {name}
      </Text>
      {subtitle === undefined ? null : (
        <Text color="muted-foreground">{subtitle}</Text>
      )}
      {children}
    </YStack>
  )
}
