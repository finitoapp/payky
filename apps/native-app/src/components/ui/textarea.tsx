import { type GetProps, styled, TextArea } from "tamagui"
import { fontSize, radius } from "../../theme/tokens.ts"

/**
 * Web `apps/web-app/src/components/ui/textarea.tsx`, on Tamagui `TextArea`:
 * `ui/input.tsx`'s field with `min-h-24 py-2` (96/8), top-aligned text.
 */

export const Textarea = styled(TextArea, {
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
    disabled: { true: { opacity: 0.5, bg: "input-disabled" } },
  } as const,
})

export type TextareaProps = GetProps<typeof Textarea>
