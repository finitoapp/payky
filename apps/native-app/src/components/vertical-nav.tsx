import { type Href, router } from "expo-router"
import ChevronRight from "lucide-react-native/icons/chevron-right"
import type { ReactNode } from "react"
import { Linking } from "react-native"
import { styled, Text, View } from "tamagui"
import { fontSize, fontWeight, radius } from "../theme/tokens.ts"
import { Icon } from "./ui/icon.tsx"

/**
 * Web `apps/web-app/src/components/vertical-nav.tsx`: a card of rows, each
 * an icon, a label and a trailing action or chevron, divided by hairlines.
 *
 * Tailwind mirrored: the shell `bg-card rounded-md overflow-hidden`, the
 * title `p-4 font-bold text-xs text-muted-foreground`, the rows `divide-y`,
 * `gap-3 px-3 py-2 text-sm font-medium` with `p-1`/`p-0.5` inside, the
 * chevron `size-4`, the action `shrink-0 pl-2`.
 *
 * Native differences: the shell has no `shadow` (Tamagui 3 `styled()` takes
 * no elevation); a row is at least 56 high, for touch; a pressed row takes
 * `bg-accent` (web hovers `bg-accent/50`); a `link` row pushes an
 * expo-router `href`, an `href` row opens the URL outside the app.
 */

/** The shell a `VerticalNav` draws, shared with `ListSkeleton` so the two cannot drift apart. */
export const VerticalNavShell = styled(View, {
  name: "VerticalNavShell",
  bg: "card",
  rounded: radius.md,
  overflow: "hidden",
})

/** The title row a `VerticalNav` draws, shared with `ListSkeleton` for the same reason. */
export const VerticalNavTitle = styled(Text, {
  name: "VerticalNavTitle",
  p: 16,
  fontSize: fontSize.xs,
  fontWeight: fontWeight.bold,
  color: "muted-foreground",
})

type NavItemTarget =
  | { readonly kind: "link"; readonly href: Href }
  | { readonly kind: "href"; readonly href: string }
  | { readonly kind: "button"; readonly onPress?: () => void }
  /** A read-only row: no press, nothing to activate. */
  | { readonly kind: "static" }

export type VerticalNavItem = NavItemTarget & {
  /** Stable identity for list reconciliation; falls back to the index. */
  readonly id?: string
  /** Already translated; a string is drawn as the row's text. */
  readonly label: ReactNode
  readonly action?: ReactNode
  readonly icon?: ReactNode
  readonly disableAction?: boolean
  /** TalkBack name when `label` is not a string. */
  readonly accessibilityLabel?: string
}

export function VerticalNav({
  items,
  empty,
  title,
}: {
  readonly items: ReadonlyArray<VerticalNavItem>
  readonly empty?: ReactNode
  readonly title?: string
}) {
  return (
    <VerticalNavShell>
      {title === undefined || title === "" ? null : (
        <VerticalNavTitle accessibilityRole="header">{title}</VerticalNavTitle>
      )}
      {items.length === 0 && empty !== undefined ? (
        <NavRow
          item={{ kind: "static", disableAction: true, label: empty }}
          first
        />
      ) : (
        items.map((item, index) => (
          <NavRow key={item.id ?? index} item={item} first={index === 0} />
        ))
      )}
    </VerticalNavShell>
  )
}

const press = (item: VerticalNavItem): (() => void) | undefined => {
  switch (item.kind) {
    case "link":
      return () => router.push(item.href)
    case "href":
      return () => void Linking.openURL(item.href)
    case "button":
      return item.onPress
    case "static":
      return undefined
  }
}

function NavRow({
  item,
  first,
}: {
  readonly item: VerticalNavItem
  readonly first: boolean
}) {
  const onPress = press(item)
  const interactive = item.kind !== "static"
  return (
    <View
      flexDirection="row"
      items="center"
      gap={12}
      minH={56}
      px={16}
      py={10}
      borderTopWidth={first ? 0 : 1}
      borderColor="border-color"
      bg={interactive ? "transparent press:accent" : "transparent"}
      onPress={onPress}
      accessible={interactive ? true : undefined}
      accessibilityRole={
        item.kind === "link" || item.kind === "href"
          ? "link"
          : item.kind === "button"
            ? "button"
            : undefined
      }
      accessibilityLabel={
        item.accessibilityLabel ??
        (typeof item.label === "string" ? item.label : undefined)
      }
    >
      {item.icon}
      <View flex={1} minW={0}>
        {typeof item.label === "string" ? (
          <Text fontSize={fontSize.sm} fontWeight={fontWeight.medium}>
            {item.label}
          </Text>
        ) : (
          item.label
        )}
      </View>
      {item.disableAction === true ? null : (
        <View shrink={0} pl={8}>
          {item.action ?? <Icon icon={ChevronRight} />}
        </View>
      )}
    </View>
  )
}
