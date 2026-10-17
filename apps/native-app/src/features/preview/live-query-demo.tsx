import {
  createDeviceQuery,
  deviceSettingsId,
} from "@payky/core/evolu/device-client"
import { createQuery } from "@payky/core/evolu/schema"
import { useAtomValue } from "jotai"
import { Button, Text } from "tamagui"
import { deviceEvoluAtom } from "../../atoms/device-evolu.ts"
import {
  useDeviceEvoluQuery,
  useEvoluQuery,
} from "../../hooks/use-evolu-query.ts"

const itemsQuery = createQuery((db) =>
  db.selectFrom("item").select("id").where("isDeleted", "is not", 1)
)
const themeQuery = createDeviceQuery((db) =>
  db
    .selectFrom("deviceSettings")
    .select(["id", "theme"])
    .where("id", "=", deviceSettingsId)
)

/** Live-query smoke test: a harmless theme toggle must update without remount. */
export function LiveQueryDemo() {
  const items = useEvoluQuery(itemsQuery).data
  const theme = useDeviceEvoluQuery(themeQuery).data[0]?.theme ?? null
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  return (
    <>
      <Text>Live app query, items: {items.length}</Text>
      <Text>Live device query, theme: {theme ?? "unset"}</Text>
      <Button
        onPress={() =>
          deviceEvolu.update("deviceSettings", {
            id: deviceSettingsId,
            theme: theme === "dark" ? "system" : "dark",
          })
        }
      >
        Toggle theme (dark/system)
      </Button>
    </>
  )
}
