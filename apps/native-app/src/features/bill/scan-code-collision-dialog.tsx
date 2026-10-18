import { formatMoney } from "@payky/app-shared/format-money"
import type { CatalogItemRow } from "@payky/core/modules/catalog-item/catalog-item"
import { getStaffDisplayName } from "@payky/core/modules/catalog-item/catalog-item-utils"
import { FlatList, Modal, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, XStack, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"

/**
 * `scanCode` uniqueness can't be enforced across devices, so scanning a code
 * assigned to more than one catalog item is an expected outcome: staff pick
 * which one they meant, as web's `ScanCodeCollisionDialog`.
 */
export function ScanCodeCollisionDialog({
  candidates,
  onSelect,
  onClose,
}: {
  readonly candidates: ReadonlyArray<CatalogItemRow>
  readonly onSelect: (item: CatalogItemRow) => void
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const theme = useTheme()

  return (
    <Modal
      visible={candidates.length > 0}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView
        style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
      >
        <Text fontSize={24} fontWeight="600" accessibilityRole="header">
          {t("bill.scan.collision.title")}
        </Text>
        <Text color="muted-foreground" pb="3">
          {t("bill.scan.collision.description")}
        </Text>
        <FlatList
          style={{ flex: 1 }}
          data={candidates}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <YStack height={8} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelect(item)}
            >
              <XStack
                justify="space-between"
                gap="3"
                p="3"
                borderWidth={1}
                borderColor="border-color"
                rounded="lg"
              >
                <Text fontWeight="600" flex={1}>
                  {getStaffDisplayName(item)}
                </Text>
                <Text color="muted-foreground">
                  {formatMoney(
                    { value: item.unitAmount, currency: item.currency },
                    locale
                  )}
                </Text>
              </XStack>
            </Pressable>
          )}
        />
        <YStack pt="3">
          <AppButton
            variant="secondary"
            label={t("paymentWait.back")}
            onPress={onClose}
          />
        </YStack>
      </SafeAreaView>
    </Modal>
  )
}
