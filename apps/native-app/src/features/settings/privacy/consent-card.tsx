import { Text, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"

/** An on/off consent: title, what it sends, its state and the button that flips it. */
export function ConsentCard({
  title,
  description,
  status,
  actionLabel,
  onPress,
}: {
  /** All already translated. */
  readonly title: string
  readonly description: string
  readonly status: string
  readonly actionLabel: string
  readonly onPress: () => void
}) {
  return (
    <YStack
      gap="3"
      p="4"
      rounded="lg"
      borderWidth={1}
      borderColor="border-color"
    >
      <Text fontWeight="700">{title}</Text>
      <Text color="muted-foreground">{description}</Text>
      <Text fontWeight="600">{status}</Text>
      <AppButton variant="secondary" label={actionLabel} onPress={onPress} />
    </YStack>
  )
}
