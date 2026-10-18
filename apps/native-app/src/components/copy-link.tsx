import { Pressable } from "react-native"
import { Text } from "tamagui"
import { useCopyToClipboard } from "../hooks/use-copy-to-clipboard.ts"

/** A small tappable "Copy" next to a value; messages arrive translated. */
export function CopyLink({
  value,
  label,
  accessibilityLabel,
  copied,
  failed,
}: {
  readonly value: string
  readonly label: string
  readonly accessibilityLabel: string
  readonly copied: string
  readonly failed: string
}) {
  const copy = useCopyToClipboard()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={() => void copy(value, { copied, failed })}
    >
      <Text fontSize={13} fontWeight="600" color="primary">
        {label}
      </Text>
    </Pressable>
  )
}
