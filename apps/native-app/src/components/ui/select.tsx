import Check from "lucide-react-native/icons/check"
import ChevronDown from "lucide-react-native/icons/chevron-down"
import { createContext, type ReactNode, useContext, useState } from "react"
import { styled, Text, View } from "tamagui"
import { fontSize, radius } from "../../theme/tokens.ts"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog.tsx"
import { Icon } from "./icon.tsx"

/**
 * Web `apps/web-app/src/components/ui/select.tsx`: `Select`,
 * `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectGroup`,
 * `SelectLabel`, `SelectItem`, with web's `value`/`onValueChange` and
 * `items` (value → label, which `SelectValue` shows).
 *
 * Tailwind mirrored: trigger `h-8 gap-1.5 rounded-lg border border-input
 * bg-transparent py-2 pr-2 pl-2.5 text-sm dark:bg-input/30` (`sm` `h-7
 * rounded-md`) with a muted `ChevronDown`; label `px-1.5 py-1 text-xs
 * text-muted-foreground`; item `gap-1.5 rounded-md py-1 pl-1.5 text-sm
 * focus:bg-accent` with a `Check` on the selected one.
 *
 * Native differences: the list opens in `ui/dialog` (a centered sheet on the
 * proven RN `Modal`) rather than a popup anchored to the trigger, as plan
 * fallback to Tamagui `Select`'s untried `Adapt`/`Sheet`; items are at
 * least 44 high for touch. `SelectContent` takes the translated `title` the
 * sheet shows, usually the field's label.
 */

interface SelectContextValue {
  readonly value: string | null
  readonly items: Readonly<Record<string, string>> | undefined
  readonly open: boolean
  readonly setOpen: (open: boolean) => void
  readonly select: (value: string) => void
  readonly disabled: boolean
}

const SelectContext = createContext<SelectContextValue | undefined>(undefined)

const useSelect = (): SelectContextValue => {
  const context = useContext(SelectContext)
  if (context === undefined)
    throw new Error("Select parts must be inside Select")
  return context
}

export function Select<Value extends string>({
  value,
  onValueChange,
  items,
  disabled = false,
  children,
}: {
  readonly value: Value | null
  readonly onValueChange: (value: Value) => void
  /** Already translated labels; `SelectValue` shows the selected one. */
  readonly items?: Readonly<Record<Value, string>>
  readonly disabled?: boolean
  readonly children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <SelectContext
      value={{
        value,
        items,
        open,
        setOpen,
        select: (next) => {
          setOpen(false)
          // Items carry plain strings; every one of them is a `Value`.
          onValueChange(next as Value)
        },
        disabled,
      }}
    >
      {children}
    </SelectContext>
  )
}

const TriggerFrame = styled(View, {
  name: "SelectTrigger",
  flexDirection: "row",
  items: "center",
  justify: "space-between",
  self: "flex-start",
  gap: 6,
  py: 8,
  pr: 8,
  pl: 10,
  rounded: radius.lg,
  borderWidth: 1,
  borderColor: "input",
  bg: "input-bg press:input-50",

  variants: {
    size: {
      default: { h: 32 },
      sm: { h: 28, rounded: radius.md },
    },
    disabled: { true: { opacity: 0.5, pointerEvents: "none" } },
  } as const,

  defaultVariants: { size: "default" },
})

export function SelectTrigger({
  size,
  accessibilityLabel,
  fullWidth = false,
  children,
}: {
  readonly size?: "default" | "sm"
  /** Already translated; the field's label. */
  readonly accessibilityLabel?: string
  /** Web's `w-full` on the trigger. */
  readonly fullWidth?: boolean
  readonly children: ReactNode
}) {
  const select = useSelect()
  return (
    <TriggerFrame
      size={size}
      disabled={select.disabled}
      hitSlop={size === "sm" ? 10 : 8}
      onPress={select.disabled ? undefined : () => select.setOpen(true)}
      accessibilityRole="combobox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: select.open, disabled: select.disabled }}
      {...(fullWidth ? { self: "stretch" } : {})}
    >
      {children}
      <Icon icon={ChevronDown} color="muted-foreground" />
    </TriggerFrame>
  )
}

/** The selected item's label from `items`, else `children` or `placeholder`. */
export function SelectValue({
  placeholder,
  children,
}: {
  readonly placeholder?: string
  readonly children?: ReactNode
}) {
  const { value, items } = useSelect()
  if (children !== undefined) return <View shrink={1}>{children}</View>
  const label = value === null ? undefined : items?.[value]
  return (
    <Text
      shrink={1}
      numberOfLines={1}
      fontSize={fontSize.sm}
      color={label === undefined ? "muted-foreground" : "color"}
    >
      {label ?? placeholder ?? ""}
    </Text>
  )
}

export function SelectContent({
  title,
  children,
}: {
  /** Already translated. */
  readonly title?: string
  readonly children: ReactNode
}) {
  const { open, setOpen } = useSelect()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        {title === undefined ? null : (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}
        <View gap={4}>{children}</View>
      </DialogContent>
    </Dialog>
  )
}

export const SelectGroup = styled(View, {
  name: "SelectGroup",
  role: "list",
  gap: 2,
})

export const SelectLabel = styled(Text, {
  name: "SelectLabel",
  px: 6,
  py: 4,
  fontSize: fontSize.xs,
  color: "muted-foreground",
})

const ItemFrame = styled(View, {
  name: "SelectItem",
  flexDirection: "row",
  items: "center",
  gap: 6,
  minH: 44,
  py: 4,
  pl: 6,
  pr: 8,
  rounded: radius.md,
  bg: "transparent press:accent",

  variants: {
    disabled: { true: { opacity: 0.5, pointerEvents: "none" } },
  } as const,
})

export function SelectItem({
  value,
  disabled = false,
  children,
}: {
  readonly value: string
  readonly disabled?: boolean
  /** Already translated text, or custom content. */
  readonly children: ReactNode
}) {
  const select = useSelect()
  const selected = select.value === value
  return (
    <ItemFrame
      disabled={disabled}
      onPress={disabled ? undefined : () => select.select(value)}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
    >
      <View flex={1}>
        {typeof children === "string" ? (
          <Text fontSize={fontSize.sm}>{children}</Text>
        ) : (
          children
        )}
      </View>
      <View opacity={selected ? 1 : 0}>
        <Icon icon={Check} />
      </View>
    </ItemFrame>
  )
}
