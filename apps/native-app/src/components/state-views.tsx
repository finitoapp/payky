import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { ActivityIndicator } from "react-native"
import { Text, YStack } from "tamagui"
import { useTranslation } from "../hooks/use-translation.ts"
import { Button } from "./ui/button.tsx"

export function LoadingView() {
  return (
    <YStack flex={1} items="center" justify="center">
      <ActivityIndicator size="large" />
    </YStack>
  )
}

/** `message` is already translated. */
export function EmptyView({ message }: { readonly message: string }) {
  return (
    <YStack flex={1} items="center" justify="center" p="4">
      <Text color="muted-foreground" text="center">
        {message}
      </Text>
    </YStack>
  )
}

export function FailureView({
  messageKey,
  onRetry,
}: {
  readonly messageKey: TranslationKey
  readonly onRetry?: () => void
}) {
  const { t } = useTranslation()
  return (
    <YStack flex={1} items="center" justify="center" gap="3" p="4">
      <Text
        text="center"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        {t(messageKey)}
      </Text>
      {onRetry === undefined ? null : (
        <Button
          size="lg"
          label={t("appError.tryAgain")}
          variant="outline"
          onPress={onRetry}
        />
      )}
    </YStack>
  )
}
