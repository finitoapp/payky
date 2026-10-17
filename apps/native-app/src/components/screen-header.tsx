import { router } from "expo-router"
import { Pressable } from "react-native"
import { Text, XStack } from "tamagui"
import { useTranslation } from "../hooks/use-translation.ts"

/** Back to the previous screen, or home when this one was opened cold. */
const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"))

/** Back arrow and title, as web's `FadeHeader`; `title` is already translated. */
export function ScreenHeader({ title }: { readonly title: string }) {
  const { t } = useTranslation()

  return (
    <XStack items="center" gap="2" pb="2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("nav.back")}
        hitSlop={12}
        onPress={goBack}
      >
        <Text fontSize={28} lineHeight={32}>
          ‹
        </Text>
      </Pressable>
      <Text flex={1} fontSize={22} fontWeight="700" numberOfLines={1}>
        {title}
      </Text>
    </XStack>
  )
}
