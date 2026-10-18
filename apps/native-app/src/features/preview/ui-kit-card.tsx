import ArrowLeft from "lucide-react-native/icons/arrow-left"
import Check from "lucide-react-native/icons/check"
import ChevronRight from "lucide-react-native/icons/chevron-right"
import Plus from "lucide-react-native/icons/plus"
import { Text, View } from "tamagui"
import { Button } from "../../components/ui/button.tsx"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx"
import { Icon } from "../../components/ui/icon.tsx"
import { Input } from "../../components/ui/input.tsx"
import { Textarea } from "../../components/ui/textarea.tsx"

const variants = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
] as const

/** Dev-only: every ui kit component in one place, to eyeball on the device. */
export function UiKitCard() {
  return (
    <View
      bg="card"
      borderColor="border-color"
      borderWidth={1}
      rounded="lg"
      p="4"
      gap="3"
    >
      <Text fontWeight="600">UI kit</Text>
      <View flexDirection="row" gap="4" items="center">
        <Icon icon={ArrowLeft} size={20} color="primary" strokeWidth={3} />
        <Icon icon={Check} color="success" />
        <Icon icon={ChevronRight} size={20} color="muted-foreground" />
      </View>
      {variants.map((variant) => (
        <View key={variant} flexDirection="row" gap="2" items="center">
          <Button variant={variant} label={variant} />
          <Button variant={variant} size="sm" label="sm" iconStart={Plus} />
          <Button
            variant={variant}
            size="icon"
            iconStart={Plus}
            accessibilityLabel={`${variant} icon`}
          />
        </View>
      ))}
      <Button size="lg" label="Large" iconEnd={ChevronRight} />
      <Button size="lg" variant="outline" label="Pending" pending />
      <Button size="lg" label="Disabled" disabled />
      <Card>
        <CardHeader>
          <CardTitle>Card title</CardTitle>
          <CardDescription>Card description</CardDescription>
          <CardAction>
            <Button size="xs" variant="outline" label="Action" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Text>Card content</Text>
        </CardContent>
        <CardFooter>
          <Button variant="outline" label="Footer" />
        </CardFooter>
      </Card>
      <Input placeholder="Input" />
      <Input placeholder="Invalid" invalid />
      <Input placeholder="Disabled" disabled />
      <Textarea placeholder="Textarea" />
      <Card size="sm">
        <CardHeader>
          <CardTitle>Small card</CardTitle>
        </CardHeader>
        <CardContent>
          <Text>No footer</Text>
        </CardContent>
      </Card>
    </View>
  )
}
