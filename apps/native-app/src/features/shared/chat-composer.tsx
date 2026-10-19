import Send from "lucide-react-native/icons/send"
import Square from "lucide-react-native/icons/square"
import { useState } from "react"
import { XStack } from "tamagui"
import { Button } from "../../components/ui/button.tsx"
import { Card, CardContent } from "../../components/ui/card.tsx"
import { Textarea } from "../../components/ui/textarea.tsx"

/**
 * The message field with Send (or Stop while a reply is coming); the draft is
 * this component's state only. All labels are already translated.
 */
export function ChatComposer({
  label,
  placeholder,
  sendLabel,
  disabled,
  stop,
  onSend,
}: {
  readonly label: string
  readonly placeholder: string
  readonly sendLabel: string
  readonly disabled: boolean
  readonly stop?: { readonly label: string; readonly onStop: () => void }
  readonly onSend: (text: string) => void
}) {
  const [text, setText] = useState("")
  const trimmed = text.trim()

  return (
    <Card size="sm" borderBottomLeftRadius={0} borderBottomRightRadius={0}>
      <CardContent>
        <XStack gap="2" items="flex-end">
          <Textarea
            flex={1}
            minW={0}
            minH={36}
            maxH={128}
            fontSize="sm"
            accessibilityLabel={label}
            placeholder={placeholder}
            value={text}
            disabled={disabled}
            onChangeText={setText}
          />
          {stop === undefined ? (
            <Button
              size="icon-lg"
              accessibilityLabel={sendLabel}
              variant={
                disabled || trimmed.length === 0 ? "secondary" : "default"
              }
              disabled={disabled || trimmed.length === 0}
              onPress={() => {
                if (disabled || trimmed.length === 0) return
                onSend(trimmed)
                setText("")
              }}
            >
              <Send />
            </Button>
          ) : (
            <Button
              size="icon-lg"
              accessibilityLabel={stop.label}
              variant="secondary"
              onPress={stop.onStop}
            >
              <Square />
            </Button>
          )}
        </XStack>
      </CardContent>
    </Card>
  )
}
