import { useState } from "react"
import { XStack, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { Field } from "../../../components/field.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"

/** The message field and Send; the draft is this component's state only. */
export function SupportChatComposer({
  disabled,
  onSend,
}: {
  readonly disabled: boolean
  readonly onSend: (text: string) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const trimmed = text.trim()

  return (
    <XStack gap="2" items="flex-end">
      <YStack flex={1}>
        <Field
          label={t("settings.supportChat.message.label")}
          placeholder={t("settings.supportChat.message.placeholder")}
          value={text}
          multiline
          minH={48}
          disabled={disabled}
          onChangeText={setText}
        />
      </YStack>
      <AppButton
        label={t("settings.supportChat.send")}
        disabled={disabled || trimmed.length === 0}
        onPress={() => {
          onSend(trimmed)
          setText("")
        }}
      />
    </XStack>
  )
}
