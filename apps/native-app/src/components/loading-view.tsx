import { ActivityIndicator } from "react-native"
import { YStack } from "tamagui"

/** Native Suspense fallback for screens whose web route resolves data locally. */
export function LoadingView() {
  return (
    <YStack flex={1} items="center" justify="center">
      <ActivityIndicator size="large" />
    </YStack>
  )
}
