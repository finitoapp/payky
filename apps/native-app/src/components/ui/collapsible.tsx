import { createContext, type ReactNode, useContext, useState } from "react"
import { type GetProps, View } from "tamagui"

/**
 * Web `apps/web-app/src/components/ui/collapsible.tsx` (Base UI
 * `Collapsible`): `Collapsible` holds `open` (controlled with
 * `onOpenChange`, or from `defaultOpen`), `CollapsibleTrigger` toggles it
 * and announces `expanded`, `CollapsibleContent` mounts only while open.
 * Web styles the trigger per call site, so the trigger takes view props;
 * `useCollapsible()` gives a chevron inside it the current state.
 */

interface CollapsibleContextValue {
  readonly open: boolean
  readonly setOpen: (open: boolean) => void
}

const CollapsibleContext = createContext<CollapsibleContextValue>({
  open: false,
  setOpen: () => {},
})

export const useCollapsible = () => useContext(CollapsibleContext)

export function Collapsible({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  readonly open?: boolean
  readonly defaultOpen?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly children: ReactNode
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }
  return (
    <CollapsibleContext value={{ open, setOpen }}>
      {children}
    </CollapsibleContext>
  )
}

export function CollapsibleTrigger({
  children,
  disabled = false,
  ...viewProps
}: Omit<GetProps<typeof View>, "onPress" | "disabled"> & {
  readonly children: ReactNode
  /** As web's trigger `disabled`: the panel stays as it is. */
  readonly disabled?: boolean
}) {
  const { open, setOpen } = useCollapsible()
  return (
    <View
      accessibilityRole="button"
      accessibilityState={{ expanded: open, disabled }}
      hitSlop={8}
      onPress={disabled ? undefined : () => setOpen(!open)}
      {...viewProps}
    >
      {children}
    </View>
  )
}

export function CollapsibleContent({
  children,
  ...viewProps
}: GetProps<typeof View> & { readonly children: ReactNode }) {
  return useCollapsible().open ? <View {...viewProps}>{children}</View> : null
}
