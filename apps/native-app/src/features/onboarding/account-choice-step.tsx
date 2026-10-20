import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import KeyRound from "lucide-react-native/icons/key-round"
import Plus from "lucide-react-native/icons/plus"
import QrCode from "lucide-react-native/icons/qr-code"
import { Text, YStack } from "tamagui"
import { Icon } from "../../components/ui/icon.tsx"
import { VerticalNav } from "../../components/vertical-nav.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

type NativeAccountType = "new" | "restore" | "transfer"

const options = [
  {
    type: "new",
    title: "accountChoice.new.title",
    description: "accountChoice.new.description",
    icon: Plus,
  },
  {
    type: "restore",
    title: "accountChoice.restore.title",
    description: "accountChoice.restore.description",
    icon: KeyRound,
  },
  {
    type: "transfer",
    title: "accountChoice.transfer.title",
    description: "accountChoice.transfer.description",
    icon: QrCode,
  },
] satisfies ReadonlyArray<{
  readonly type: NativeAccountType
  readonly title: TranslationKey
  readonly description: TranslationKey
  readonly icon: typeof Plus
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
    <VerticalNav
      items={options.map((option) => ({
        id: option.type,
        kind: "button",
        icon: <Icon icon={option.icon} color="muted-foreground" />,
        label: (
          <YStack gap="1">
            <Text fontSize="sm" lineHeight="sm" fontWeight="600">
              {t(option.title)}
            </Text>
            <Text fontSize="xs" lineHeight="xs" color="muted-foreground">
              {t(option.description)}
            </Text>
          </YStack>
        ),
        accessibilityLabel: `${t(option.title)}. ${t(option.description)}`,
        onPress: () => {
          if (!pending) onSelect(option.type)
        },
      }))}
    />
  )
}
