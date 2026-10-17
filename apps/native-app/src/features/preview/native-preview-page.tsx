import { useState } from "react"
import { ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Button, Text, useTheme, View } from "tamagui"
import { checkSharedLogic } from "../../core/check-shared-logic.ts"

export function NativePreviewPage() {
  const theme = useTheme()
  const [roundedAmount, setRoundedAmount] = useState(checkSharedLogic)
  const [checks, setChecks] = useState(1)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View flex={1} justify="center" p="6" gap="6">
          <Text fontFamily="heading" fontSize={30} fontWeight="700">
            Payky Native
          </Text>
          <Text color="muted-foreground">
            Expo, React Native and Tamagui are ready.
          </Text>
          <View
            backgroundColor="card"
            borderColor="border-color"
            borderWidth={1}
            rounded="lg"
            p="4"
            gap="3"
          >
            <Text fontWeight="600">Shared business logic</Text>
            <Text>
              CZK cash rounding: 123.45 →{" "}
              {(roundedAmount / 100).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
            <Text accessibilityLiveRegion="polite">
              Checks passed: {checks}
            </Text>
          </View>
          <Button
            backgroundColor="primary"
            color="primary-foreground"
            rounded="lg"
            minHeight={48}
            onPress={() => {
              setRoundedAmount(checkSharedLogic())
              setChecks((count) => count + 1)
            }}
          >
            Run shared logic again
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
