import Eye from "lucide-react-native/icons/eye"
import EyeOff from "lucide-react-native/icons/eye-off"
import { useState } from "react"
import { View } from "tamagui"
import { Button } from "./ui/button.tsx"
import { Icon } from "./ui/icon.tsx"
import { Textarea, type TextareaProps } from "./ui/textarea.tsx"

/**
 * Web `apps/web-app/src/components/password-textarea.tsx`: a textarea for a
 * secret such as a recovery phrase, masked until the eye button shows it.
 *
 * Tailwind mirrored: `pr-10`, the toggle `variant="ghost" size="sm"
 * absolute right-0 top-0 h-10 px-3` with a muted `size-4` `Eye`/`EyeOff`.
 *
 * Native differences: Android cannot mask a multiline input, so while
 * hidden it is one masked line (`secureTextEntry`) and only the shown state
 * wraps. Shown, it uses the `visible-password` keyboard, which offers no
 * suggestions and learns nothing; both states keep autocorrect, spell
 * check and autofill off whatever the caller passes. Web's `font-mono` is
 * left out: the Tamagui config has no mono font.
 */
export function PasswordTextarea({
  hideLabel,
  showLabel,
  shown: shownProp,
  onShownChange,
  ...props
}: TextareaProps & {
  readonly hideLabel: string
  readonly showLabel: string
  readonly shown?: boolean
  readonly onShownChange?: (shown: boolean) => void
}) {
  const [internalShown, setInternalShown] = useState(false)
  const shown = shownProp ?? internalShown
  const toggleShown = () => {
    const nextShown = !shown
    if (shownProp === undefined) setInternalShown(nextShown)
    onShownChange?.(nextShown)
  }
  return (
    <View w="100%">
      <Textarea
        {...props}
        pr={40}
        minH={shown ? 96 : 40}
        multiline={shown}
        secureTextEntry={!shown}
        keyboardType={shown ? "visible-password" : "default"}
        autoComplete="off"
        importantForAutofill="no"
        autoCorrect={false}
        spellCheck={false}
        autoCapitalize="none"
      />
      <View position="absolute" t={0} r={0} h={40} justify="center">
        <Button
          variant="ghost"
          size="icon"
          aria-label={shown ? hideLabel : showLabel}
          onPress={toggleShown}
        >
          <Icon icon={shown ? EyeOff : Eye} color="muted-foreground" />
        </Button>
      </View>
    </View>
  )
}
