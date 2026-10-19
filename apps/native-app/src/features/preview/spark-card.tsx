import { SparkSecret } from "@payky/core/modules/shared/key-derivation"
import {
  createDefaultSparkPaymentWallet,
  createSharedSparkSyncWallet,
} from "@payky/core/spark/spark-wallet"
import { useState } from "react"
import { Text, View } from "tamagui"
import { Button } from "../../components/ui/button.tsx"

const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`

/**
 * Throwaway REGTEST identity: a fresh random secret per press, held only in
 * this function's scope. Never the account's key, never shown or logged.
 */
const exercise = async (): Promise<string> => {
  const lines: string[] = []
  const time = async <T,>(name: string, work: () => Promise<T>): Promise<T> => {
    const start = Date.now()
    try {
      return await work()
    } finally {
      lines.push(`${name}: ${Date.now() - start} ms`)
    }
  }
  const secret = SparkSecret(
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("")
  )
  try {
    await using payment = await time("acquire #1 (init)", () =>
      createDefaultSparkPaymentWallet(secret, "REGTEST")
    )
    lines.push(
      `identity ${short(await time("identity", () => payment.getIdentityPublicKey()))}`
    )
    const balance = await time("balance", () => payment.getBalance())
    lines.push(`balance ${balance.availableSats} sats`)
    const invoice = await time("invoice", () =>
      payment.createLightningInvoice({ amountSats: 1000 })
    )
    lines.push(`invoice ${invoice.invoice.encodedInvoice.slice(0, 8)}…`)
    {
      await using sync = await time("acquire #2 (pooled)", () =>
        createSharedSparkSyncWallet(secret, "REGTEST")
      )
      const unsubscribe = sync.subscribe({ "balance:update": () => {} })
      lines.push("subscribed")
      unsubscribe()
    }
    lines.push("holder #2 disposed, #1 still usable")
    lines.push(
      `balance after #2 dispose ${(await payment.getBalance()).availableSats}`
    )
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error
    lines.push(`ERROR ${name}: ${String(error).slice(0, 200)}`)
  }
  lines.push("disposed")
  return lines.join("\n")
}

export function SparkCard() {
  const [text, setText] = useState("-")
  const [busy, setBusy] = useState(false)
  const press = async () => {
    setBusy(true)
    setText("running")
    try {
      setText(await exercise())
    } catch (error) {
      setText(`thrown ${String(error)}`)
    }
    setBusy(false)
  }
  return (
    <View gap="2">
      <Text fontWeight="600">Spark (REGTEST, throwaway identity)</Text>
      <Button variant="outline" disabled={busy} onPress={press}>
        Spark: run
      </Button>
      <Text>{text}</Text>
    </View>
  )
}
