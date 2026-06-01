import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai"
import { useMemo } from "react"
import { Button } from "@/components/ui/button.tsx"
import { useTranslation } from "@/i18n/use-translation.ts"

const keypad = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "C",
  "0",
  "<",
] as const

const maxAmountDigits = 9

type KeypadKey = (typeof keypad)[number]
type AmountDigitsAtom = PrimitiveAtom<string>

function formatUsdAmount(amountMinor: number) {
  const dollars = Math.floor(amountMinor / 100).toLocaleString("en-US")
  const cents = String(amountMinor % 100).padStart(2, "0")

  return `$${dollars}.${cents}`
}

export function TerminalPaymentKeypad() {
  const amountDigitsAtom = useMemo(() => atom(""), [])

  return (
    <>
      <AmountDisplay amountDigitsAtom={amountDigitsAtom} />
      <Keypad amountDigitsAtom={amountDigitsAtom} />
      <ChargeButton amountDigitsAtom={amountDigitsAtom} />
    </>
  )
}

function AmountDisplay({
  amountDigitsAtom,
}: {
  readonly amountDigitsAtom: AmountDigitsAtom
}) {
  const { t } = useTranslation()
  const amountDigits = useAtomValue(amountDigitsAtom)

  const amountMinor = amountDigits === "" ? 0 : Number(amountDigits)

  return (
    <section className="flex flex-col items-center gap-5 text-center">
      <h1 className="text-6xl font-semibold tracking-normal tabular-nums">
        {formatUsdAmount(amountMinor)}
      </h1>
      <p className="text-xl text-foreground/80">{t("home.sats")}</p>
    </section>
  )
}

function Keypad({
  amountDigitsAtom,
}: {
  readonly amountDigitsAtom: AmountDigitsAtom
}) {
  const { t } = useTranslation()
  const setAmountDigits = useSetAtom(amountDigitsAtom)

  function handleKeypadPress(key: KeypadKey) {
    if (key === "C") {
      setAmountDigits("")
      return
    }

    if (key === "<") {
      setAmountDigits((current) => current.slice(0, -1))
      return
    }

    setAmountDigits((current) => {
      if (current.length >= maxAmountDigits) return current
      if (current === "" && key === "0") return ""

      return `${current}${key}`
    })
  }

  function getKeypadAriaLabel(key: KeypadKey) {
    if (key === "C") return t("home.keypad.clear")
    if (key === "<") return t("home.keypad.backspace")

    return key
  }

  return (
    <section className="grid grid-cols-3 gap-x-12 gap-y-6 px-8">
      {keypad.map((key) => (
        <Button
          key={key}
          variant="ghost"
          aria-label={getKeypadAriaLabel(key)}
          className="h-16 rounded-full text-2xl text-foreground hover:bg-primary-foreground/10"
          onClick={() => handleKeypadPress(key)}
        >
          {key}
        </Button>
      ))}
    </section>
  )
}

function ChargeButton({
  amountDigitsAtom,
}: {
  readonly amountDigitsAtom: AmountDigitsAtom
}) {
  const { t } = useTranslation()
  const amountDigits = useAtomValue(amountDigitsAtom)

  return (
    <Button
      className="h-14 rounded-full bg-primary-foreground/15 text-base font-bold text-foreground hover:bg-primary-foreground/20"
      disabled={amountDigits === ""}
    >
      {t("home.charge")}
    </Button>
  )
}
