import { Text, YStack } from "tamagui"
import { useTranslation } from "../../hooks/use-translation.ts"

/**
 * Only "new" so far: restoring and transferring an account have no native
 * screens yet (web offers all three in `AccountTypeChoice`).
 */
export function AccountChoiceStep({
  pending,
  onSelect,
}: {
  readonly pending: boolean
  readonly onSelect: (accountType: "new") => void
}) {
  const { t } = useTranslation()
  return (
    <YStack
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
        if (!pending) onSelect("new")
      }}
    >
      <Text fontWeight="600">{t("accountChoice.new.title")}</Text>
      <Text fontSize="sm" color="muted-foreground">
        {t("accountChoice.new.description")}
      </Text>
    </YStack>
  )
}
