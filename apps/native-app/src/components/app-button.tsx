import { ActivityIndicator } from "react-native"
import { Button } from "tamagui"

interface AppButtonProps {
  /** Already translated. */
  readonly label: string
  readonly onPress: () => void
  readonly variant?: "primary" | "destructive" | "secondary"
  readonly pending?: boolean
  readonly disabled?: boolean
}

/** Primary/destructive/secondary action; `pending` blocks presses and spins. */
export function AppButton({
  label,
  onPress,
  variant = "primary",
  pending = false,
  disabled = false,
}: AppButtonProps) {
  const inactive = disabled || pending
  return (
    <Button
      minH={48}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: pending }}
      disabled={inactive}
      opacity={inactive ? 0.6 : 1}
      onPress={onPress}
      bg={
        variant === "primary"
          ? "primary"
          : variant === "destructive"
            ? "red-600"
            : "background"
      }
      borderColor={variant === "secondary" ? "border-color" : "transparent"}
      borderWidth={1}
      color={variant === "secondary" ? "color" : "white"}
      icon={pending ? <ActivityIndicator color="white" /> : undefined}
    >
      {label}
    </Button>
  )
}
