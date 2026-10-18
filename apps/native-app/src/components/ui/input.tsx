import { type GetProps, styled, Input as TamaguiInput } from "tamagui"
import { fontSize, radius } from "../../theme/tokens.ts"
import { useFieldLabelId } from "./field.tsx"

/**
 * Web `apps/web-app/src/components/ui/input.tsx`, on Tamagui `Input`.
 *
 * Tailwind mirrored: `rounded-lg border border-input bg-transparent px-2.5
 * py-1 text-base placeholder:text-muted-foreground focus-visible:border-ring
 * disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive
 * dark:bg-input/30 dark:disabled:bg-input/80`.
 *
 * Native differences: web's `h-8` (32) becomes a minimum of 40, because a
 * text input takes no `hitSlop` and the field itself is the touch target;
 * the focus ring (`ring-3 ring-ring/50`) is only the border color; `invalid`
 * stands in for `aria-invalid`. Every TextInput prop passes through, so
 * `secureTextEntry`, `contextMenuHidden` and the autofill props keep working
 * where a screen relies on them.
 */

const InputFrame = styled(TamaguiInput, {
  name: "Input",
  minH: 40,
  rounded: radius.lg,
  borderWidth: 1,
  borderColor: "input focus:ring",
  bg: "input-bg",
  px: 10,
  py: 4,
  color: "color",
  fontSize: fontSize.base,
  placeholderTextColor: "muted-foreground",
  caretColor: "primary",

  variants: {
    invalid: { true: { borderColor: "destructive" } },
  } as const,
})

export type InputProps = GetProps<typeof InputFrame>

/** Inside a `ui/field` `Field`, TalkBack names it after the `FieldLabel`. */
export function Input(props: InputProps) {
  // The disabled look is applied here, not as a variant, so `disabled`
  // still reaches Tamagui's input and makes it read-only.
  const disabledStyle =
    props.disabled === true
      ? ({ opacity: 0.5, bg: "input-disabled" } as const)
      : {}
  return (
    <InputFrame
      accessibilityLabelledBy={useFieldLabelId()}
      {...disabledStyle}
      {...props}
    />
  )
}
