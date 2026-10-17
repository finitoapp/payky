import {
  accountListQuery,
  createAccountMasterKey,
  insertAccount,
  selectAccount,
} from "@payky/core/evolu/device-account"
import { useAtomValue, useSetAtom } from "jotai"
import { Button, Text, View } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { deviceEvoluAtom } from "../../atoms/device-evolu.ts"
import { reloadAppEvoluAtom } from "../../atoms/evolu-counter.ts"
import { useDeviceEvoluQuery } from "../../hooks/use-evolu-query.ts"

export function AccountsCard() {
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const active = useAtomValue(accountAtom)
  const reload = useSetAtom(reloadAppEvoluAtom)
  const accounts = useDeviceEvoluQuery(accountListQuery).data

  // TODO(access task): web requires the "admin" permission before switching
  // (`require("admin", "access.action.switchAccount")`); add it with the PIN gate.
  return (
    <View gap="2">
      <Text fontWeight="600">Accounts</Text>
      {accounts.map((a) => (
        <View key={a.id} gap="1">
          <Text>
            {a.id === active.id ? "* " : ""}
            {a.name} ({a.id.slice(0, 8)})
          </Text>
          {a.id === active.id ? null : (
            <Button
              onPress={() => {
                selectAccount(deviceEvolu, a.id)
                reload()
              }}
            >
              Switch
            </Button>
          )}
        </View>
      ))}
      <Button
        onPress={() => {
          insertAccount(deviceEvolu, createAccountMasterKey())
          reload()
        }}
      >
        Add diagnostic account
      </Button>
    </View>
  )
}
