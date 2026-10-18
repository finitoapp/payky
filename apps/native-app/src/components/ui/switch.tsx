import { Switch as RNSwitch } from "react-native"
import { useTheme } from "tamagui"

/**
 * Web `apps/web-app/src/components/ui/switch.tsx`: track `bg-primary` when
 * checked and `bg-input` (dark `bg-input/80`) when not, thumb
 * `bg-background` (dark: `primary-foreground` checked, `foreground` not),
 * `disabled:opacity-50`.
 *
 * Base: RN `Switch`, not Tamagui `Switch`. The RN one is the Android
 * control TalkBack announces as a switch and the native screens already
 * use; Tamagui's has not been tried on the device yet. RN's Android switch
 * has one size, so web's `size="sm"` is not ported.
 */
export interface SwitchProps {
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly disabled?: boolean
  /** Already translated; a switch has no visible text of its own. */
  readonly accessibilityLabel: string
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  accessibilityLabel,
}: SwitchProps) {
  const theme = useTheme()
  return (
    <RNSwitch
      value={checked}
      onValueChange={onCheckedChange}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      trackColor={{
        false: theme["switch-track-off"]?.val,
        true: theme.primary?.val,
      }}
      thumbColor={
        checked ? theme["switch-thumb-on"]?.val : theme["switch-thumb-off"]?.val
      }
      style={disabled ? { opacity: 0.5 } : undefined}
    />
  )
}
