import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { Text, YStack } from "tamagui"
import { useTranslation } from "../../hooks/use-translation.ts"

type NativeAccountType = "new" | "restore" | "transfer"

const options = [
  {
    type: "new",
    title: "accountChoice.new.title",
    description: "accountChoice.new.description",
  },
  {
    type: "restore",
    title: "accountChoice.restore.title",
    description: "accountChoice.restore.description",
  },
  {
    type: "transfer",
    title: "accountChoice.transfer.title",
    description: "accountChoice.transfer.description",
  },
] satisfies ReadonlyArray<{
  readonly type: NativeAccountType
  readonly title: TranslationKey
  readonly description: TranslationKey
}>

/** New, restore, and transfer from another device. */
export function AccountChoiceStep({
  pending,
  onSelect,
}: {
  readonly pending: boolean
  readonly onSelect: (accountType: NativeAccountType) => void
}) {
  const { t } = useTranslation()
  return (
    <YStack gap="3">
      {options.map((option) => (
        <YStack
          key={option.type}
          gap="1"
          p="4"
          minH={48}
          rounded="lg"
          borderWidth={1}
          borderColor="border-color"
          opacity={pending ? 0.6 : 1}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
          onPress={() => {
            if (!pending) onSelect(option.type)
          }}
        >
          <Text fontWeight="600">{t(option.title)}</Text>
          <Text fontSize="sm" color="muted-foreground">
            {t(option.description)}
          </Text>
        </YStack>
      ))}
    </YStack>
  )
}
