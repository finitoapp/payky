import { type GetProps, styled, TextArea } from "tamagui"
import { fontSize, radius } from "../../theme/tokens.ts"
import { useFieldLabelId } from "./field.tsx"

/**
 * Web `apps/web-app/src/components/ui/textarea.tsx`, on Tamagui `TextArea`:
 * `ui/input.tsx`'s field with `min-h-24 py-2` (96/8), top-aligned text.
 */

const TextareaFrame = styled(TextArea, {
  name: "Textarea",
  minH: 96,
  rounded: radius.lg,
  borderWidth: 1,
  borderColor: "input focus:ring",
  bg: "input-bg",
  px: 10,
  py: 8,
  color: "color",
  fontSize: fontSize.base,
  placeholderTextColor: "muted-foreground",
  caretColor: "primary",
  textAlignVertical: "top",
  multiline: true,

  variants: {
    invalid: { true: { borderColor: "destructive" } },
  } as const,
})

export type TextareaProps = GetProps<typeof TextareaFrame>

/** Inside a `ui/field` `Field`, TalkBack names it after the `FieldLabel`. */
export function Textarea(props: TextareaProps) {
  return (
    <TextareaFrame accessibilityLabelledBy={useFieldLabelId()} {...props} />
  )
}
