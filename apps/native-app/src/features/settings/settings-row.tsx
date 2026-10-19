import type { Href } from "expo-router"
import { Text } from "tamagui"
import { VerticalNav } from "../../components/vertical-nav.tsx"

/** A settings destination; `title` and `value` are already translated. */
export interface SettingsRowData {
  readonly title: string
  /** The current choice, so the menu reads as a summary. */
  readonly value?: string | undefined
  readonly href: Href
}

export function SettingsRow({ title, value, href }: SettingsRowData) {
  return (
    <VerticalNav
      items={[
        {
          kind: "link",
          href,
          label: title,
          ...(value === undefined
            ? {}
            : {
                action: (
                  <Text color="muted-foreground" numberOfLines={1}>
                    {value}
                  </Text>
                ),
              }),
        },
      ]}
    />
  )
}
