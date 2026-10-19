import Search from "lucide-react-native/icons/search"
import X from "lucide-react-native/icons/x"
import { View } from "tamagui"
import { fontSize, radius } from "../theme/tokens.ts"
import { Button } from "./ui/button.tsx"
import { Icon } from "./ui/icon.tsx"
import { Input } from "./ui/input.tsx"

/**
 * Web `apps/web-app/src/components/search-input.tsx`: a 48-high search
 * field on the card background, a muted `Search` icon inside on the left and
 * a round ghost clear button on the right while there is text.
 *
 * Tailwind mirrored: the input `h-12 bg-card pl-12 text-base`, the icon
 * `left-4 size-5 text-muted-foreground`, the clear button `size="icon-sm"
 * right-2 rounded-full`.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  clearAriaLabel,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  /** Already translated, as both texts. */
  readonly placeholder: string
  readonly clearAriaLabel: string
}) {
  return (
    <View>
      <Input
        h={48}
        bg="card"
        pl={48}
        pr={44}
        fontSize={fontSize.base}
        value={value}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        autoComplete="off"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onChangeText={onChange}
      />
      <View
        position="absolute"
        t={0}
        b={0}
        l={16}
        justify="center"
        pointerEvents="none"
      >
        <Icon icon={Search} size={20} color="muted-foreground" />
      </View>
      {value === "" ? null : (
        <View position="absolute" t={0} b={0} r={8} justify="center">
          <Button
            variant="ghost"
            size="icon-sm"
            rounded={radius.full}
            accessibilityLabel={clearAriaLabel}
            iconStart={X}
            onPress={() => onChange("")}
          />
        </View>
      )}
    </View>
  )
}
