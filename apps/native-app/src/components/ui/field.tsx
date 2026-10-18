import { createContext, type ReactNode, useContext, useId } from "react"
import { type GetProps, styled, Text, View } from "tamagui"
import { fontSize, fontWeight } from "../../theme/tokens.ts"

/**
 * Web `apps/web-app/src/components/ui/field.tsx`: the same parts.
 *
 * Tailwind mirrored: `FieldSet` `flex-col gap-4`; `FieldLegend` `mb-1.5
 * font-medium text-base` (`variant="label"` `text-sm`); `FieldGroup`
 * `flex-col gap-5`; `Field` `gap-2`, `flex-col` or (`horizontal`)
 * `flex-row items-center`; `FieldContent` `flex-1 flex-col gap-0.5`;
 * `FieldLabel`/`FieldTitle` `text-sm font-medium`; `FieldDescription`
 * `text-sm text-muted-foreground`; `FieldError` `text-sm text-destructive`
 * with `role="alert"`; `FieldSeparator` `h-5` with a centered rule.
 *
 * Native differences: web ties a label to its input with `htmlFor`; here
 * `Field` gives `FieldLabel` a `nativeID` and `ui/input` names itself after
 * it with `accessibilityLabelledBy`, which TalkBack reads. `orientation`
 * has no `responsive` value: a phone is always the narrow layout.
 */

const FieldLabelIdContext = createContext<string | undefined>(undefined)

/** The `nativeID` of the enclosing field's label, for `accessibilityLabelledBy`. */
export const useFieldLabelId = () => useContext(FieldLabelIdContext)

export const FieldSet = styled(View, { name: "FieldSet", gap: 16 })

export const FieldLegend = styled(Text, {
  name: "FieldLegend",
  mb: 6,
  fontWeight: fontWeight.medium,

  variants: {
    variant: {
      legend: { fontSize: fontSize.base },
      label: { fontSize: fontSize.sm },
    },
  } as const,

  defaultVariants: { variant: "legend" },
})

export const FieldGroup = styled(View, { name: "FieldGroup", gap: 20 })

const FieldFrame = styled(View, {
  name: "Field",
  gap: 8,

  variants: {
    orientation: {
      vertical: { flexDirection: "column" },
      horizontal: { flexDirection: "row", items: "center" },
    },
  } as const,

  defaultVariants: { orientation: "vertical" },
})

export function Field({
  children,
  ...props
}: GetProps<typeof FieldFrame> & { readonly children?: ReactNode }) {
  const labelId = useId()
  return (
    <FieldLabelIdContext value={labelId}>
      <FieldFrame {...props}>{children}</FieldFrame>
    </FieldLabelIdContext>
  )
}

export const FieldContent = styled(View, {
  name: "FieldContent",
  flex: 1,
  gap: 2,
})

const FieldLabelText = styled(Text, {
  name: "FieldLabel",
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
})

export function FieldLabel(props: GetProps<typeof FieldLabelText>) {
  return <FieldLabelText nativeID={useFieldLabelId()} {...props} />
}

export const FieldTitle = styled(Text, {
  name: "FieldTitle",
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
})

export const FieldDescription = styled(Text, {
  name: "FieldDescription",
  fontSize: fontSize.sm,
  color: "muted-foreground",
})

const FieldErrorText = styled(Text, {
  name: "FieldError",
  fontSize: fontSize.sm,
  color: "destructive",
})

/** Renders nothing without `children` or a message in `errors`. */
export function FieldError({
  children,
  errors,
  ...props
}: Omit<GetProps<typeof FieldErrorText>, "children"> & {
  readonly children?: string
  readonly errors?: ReadonlyArray<{ readonly message?: string } | undefined>
}) {
  const messages =
    children === undefined
      ? [
          ...new Set(
            (errors ?? []).flatMap((error) =>
              error?.message === undefined ? [] : [error.message]
            )
          ),
        ]
      : [children]
  if (messages.length === 0) return null
  return (
    <FieldErrorText
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      {...props}
    >
      {messages.join("\n")}
    </FieldErrorText>
  )
}

const FieldSeparatorFrame = styled(View, {
  name: "FieldSeparator",
  h: 20,
  my: -8,
  justify: "center",
})

export function FieldSeparator({ children }: { readonly children?: string }) {
  return (
    <FieldSeparatorFrame>
      <View position="absolute" l={0} r={0} h={1} bg="border-color" />
      {children === undefined ? null : (
        <Text
          self="center"
          px={8}
          bg="background"
          fontSize={fontSize.sm}
          color="muted-foreground"
        >
          {children}
        </Text>
      )}
    </FieldSeparatorFrame>
  )
}
