import Power from "lucide-react-native/icons/power"
import PowerOff from "lucide-react-native/icons/power-off"
import { XStack } from "tamagui"
import { Badge } from "../../../components/ui/badge.tsx"
import { Button } from "../../../components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"

/** An on/off consent: title, what it sends, its state and the button that flips it. */
export function ConsentCard({
  title,
  description,
  enabled,
  status,
  actionLabel,
  onPress,
}: {
  /** All already translated. */
  readonly title: string
  readonly description: string
  readonly enabled: boolean
  readonly status: string
  readonly actionLabel: string
  readonly onPress: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <XStack items="center" justify="space-between" gap="3">
          <Badge variant={enabled ? "secondary" : "outline"} label={status} />
          <Button
            size="sm"
            variant="outline"
            label={actionLabel}
            iconStart={enabled ? PowerOff : Power}
            onPress={onPress}
          />
        </XStack>
      </CardContent>
    </Card>
  )
}
