import Check from "lucide-react-native/icons/check"
import type { ReactNode } from "react"
import { Text, View } from "tamagui"
import { fontSize, fontWeight, radius } from "../theme/tokens.ts"
import { Icon } from "./ui/icon.tsx"

/**
 * Web `apps/web-app/src/components/success-panel.tsx`: a large check in a
 * success circle, a title, an optional description and the actions under
 * them.
 *
 * Tailwind mirrored: `flex-col items-center gap-5 text-center`; the circle
 * `size-24 rounded-full bg-success text-success-foreground` with a `size-14`
 * check, stroke 3; the title `text-3xl font-semibold`; the description
 * `max-w-72 text-muted-foreground`, `gap-2` below the title.
 */
export function SuccessPanel({
  actions,
  description,
  title,
}: {
  readonly actions?: ReactNode
  /** Already translated, as `title`. */
  readonly description?: string
  readonly title: string
}) {
  return (
    <View items="center" gap={20}>
      <View
        w={96}
        h={96}
        rounded={radius.full}
        bg="success"
        items="center"
        justify="center"
      >
        <Icon
          icon={Check}
          size={56}
          strokeWidth={3}
          color="success-foreground"
        />
      </View>
      <View items="center" gap={8}>
        <Text
          fontSize={fontSize["3xl"]}
          lineHeight={fontSize["3xl"]}
          fontWeight={fontWeight.semibold}
          text="center"
          accessibilityRole="header"
        >
          {title}
        </Text>
        {description === undefined ? null : (
          <Text maxW={288} color="muted-foreground" text="center">
            {description}
          </Text>
        )}
      </View>
      {actions}
    </View>
  )
}
