import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { type ComponentProps, useState } from "react"
import { Text, XStack, YStack } from "tamagui"
import { z } from "zod"
import { useToast } from "../hooks/use-toast.ts"
import { useTranslation } from "../hooks/use-translation.ts"
import { AppButton } from "./app-button.tsx"
import { Field } from "./field.tsx"

/**
 * Native counterpart of web's `InlineEditField`: the first keystroke starts an
 * edit, Save (or the keyboard's submit key) commits it, Discard drops it. Unlike
 * web there is no focus to hold, so leaving the field changes nothing: the draft
 * stays until it is saved or discarded. `codec` is the same
 * `@payky/app-shared/inline-edit-codecs` codec web uses; `onSave` resolves
 * `true` once the value is stored (a `useRunToast` result), and a `false` keeps
 * the draft so the user can retry.
 */
export function InlineEditField<T extends string | number | null>({
  label,
  description,
  placeholder,
  keyboardType,
  defaultValue,
  codec,
  errorKey,
  onSave,
}: {
  /** Already translated. */
  readonly label: string
  /** Already translated. */
  readonly description?: string
  readonly placeholder?: string
  readonly keyboardType?: ComponentProps<typeof Field>["keyboardType"]
  readonly defaultValue: T
  readonly codec: z.core.$ZodType<T, string>
  readonly errorKey: TranslationKey
  readonly onSave: (value: T) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [saving, setSaving] = useState(false)

  const discard = () => {
    setDraft(null)
    setInvalid(false)
  }

  const commit = async () => {
    if (draft === null || saving) return
    const parsed = z.safeDecode(codec, draft)
    if (!parsed.success) {
      setInvalid(true)
      return
    }
    if (parsed.data === defaultValue) {
      discard()
      return
    }
    setSaving(true)
    const saved = await onSave(parsed.data)
    setSaving(false)
    if (!saved) return
    discard()
    toast.success(t("inlineEdit.saved"))
  }

  return (
    <YStack gap="2">
      <Field
        label={label}
        value={draft ?? z.encode(codec, defaultValue)}
        placeholder={placeholder}
        keyboardType={keyboardType}
        disabled={saving}
        autoCorrect={false}
        error={invalid ? t(errorKey) : undefined}
        onChangeText={(text) => {
          setDraft(text)
          setInvalid(false)
        }}
        onSubmitEditing={() => {
          void commit()
        }}
      />
      {description === undefined ? null : (
        <Text fontSize={13} color="muted-foreground">
          {description}
        </Text>
      )}
      {draft === null ? null : (
        <XStack gap="2">
          <YStack flex={1}>
            <AppButton
              label={t("inlineEdit.save")}
              pending={saving}
              onPress={() => {
                void commit()
              }}
            />
          </YStack>
          <YStack flex={1}>
            <AppButton
              label={t("inlineEdit.discard")}
              variant="secondary"
              disabled={saving}
              onPress={discard}
            />
          </YStack>
        </XStack>
      )}
    </YStack>
  )
}
