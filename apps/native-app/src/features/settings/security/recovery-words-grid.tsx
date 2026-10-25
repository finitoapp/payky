import { RESTORE_WORD_COUNT } from "@payky/app-shared/restore-words"
import { Text, XStack } from "tamagui"

/**
 * Web's `RecoveryWordsGrid`: 20 numbered tiles in two columns. `words` is
 * `null` while the phrase is hidden, which shows masks and holds no word.
 * The words are not selectable.
 */
export function RecoveryWordsGrid({
  words,
}: {
  readonly words: ReadonlyArray<string> | null
}) {
  return (
    <XStack flexWrap="wrap" gap="2">
      {Array.from({ length: RESTORE_WORD_COUNT }, (_, index) => (
        <XStack
          // biome-ignore lint/suspicious/noArrayIndexKey: the slots are fixed positions
          key={index}
          width="48%"
          items="center"
          gap="2"
        >
          <Text
            width={20}
            fontSize="xs"
            color="muted-foreground"
            style={{ textAlign: "right" }}
          >
            {index + 1}
          </Text>
          <Text
            testID={`recovery-word-${index + 1}`}
            flex={1}
            userSelect="none"
          >
            {words === null ? "••••" : (words[index] ?? "")}
          </Text>
        </XStack>
      ))}
    </XStack>
  )
}
