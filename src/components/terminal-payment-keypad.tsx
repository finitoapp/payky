import { createRun } from "@evolu/web"
import {
  atom,
  type PrimitiveAtom,
  useAtomValue,
  useSetAtom,
  useStore,
} from "jotai"
import { LoaderCircle } from "lucide-react"
import {
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import { Button } from "@/components/ui/button.tsx"
import { createFetchDep } from "@/core/deps.ts"
import {
  type ExchangeRateQuote,
  fetchYadioBtcExchangeRate,
} from "@/core/integrations/yadio/yadio-client.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { Money } from "@/core/modules/shared/money.ts"
import {
  Currency,
  FiatCurrency,
  Integer,
} from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

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
const rateRefreshIntervalMs = 30_000
const satsPerBtc = 100_000_000
const fiatMinorUnits = 100
const keypadVibrationMs = 10

type KeypadKey = (typeof keypad)[number]
type AmountDigitsAtom = PrimitiveAtom<string>
type SetAmountDigits = (value: string | ((current: string) => string)) => void
type ChargeHandler = (money: Money) => Promise<void> | void

const numericKeyboardKeys = new Set<string>([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
])

function createMoney(amountDigits: string, currency: Currency): Money {
  return {
    value: Integer(amountDigits === "" ? 0 : Number(amountDigits)),
    currency,
  }
}

function convertFiatMinorUnitsToSats(
  amount: Integer,
  exchangeRate: number
): Integer {
  if (amount === 0) return Integer(0)

  const fiatAmount = amount / fiatMinorUnits
  return Integer(
    Math.max(1, Math.round((fiatAmount / exchangeRate) * satsPerBtc))
  )
}

function applyKeypadPress(setAmountDigits: SetAmountDigits, key: KeypadKey) {
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

function vibrateOnKeypadPress() {
  navigator.vibrate?.(keypadVibrationMs)
}

export function TerminalPaymentKeypad({
  currency,
  onCharge,
}: {
  readonly currency: FiatCurrency
  readonly onCharge: ChargeHandler
}) {
  const amountDigitsAtom = useMemo(() => atom(""), [])
  const isChargePendingRef = useRef(false)
  const [isChargePending, setIsChargePending] = useState(false)

  const handleCharge = useCallback(
    async (money: Money) => {
      if (isChargePendingRef.current) return

      isChargePendingRef.current = true
      setIsChargePending(true)

      try {
        await onCharge(money)
      } finally {
        isChargePendingRef.current = false
        setIsChargePending(false)
      }
    },
    [onCharge]
  )

  return (
    <>
      <AmountDisplay amountDigitsAtom={amountDigitsAtom} currency={currency} />
      <Keypad
        amountDigitsAtom={amountDigitsAtom}
        currency={currency}
        isChargePending={isChargePending}
        onCharge={handleCharge}
      />
      <ChargeButton
        amountDigitsAtom={amountDigitsAtom}
        currency={currency}
        isChargePending={isChargePending}
        onCharge={handleCharge}
      />
    </>
  )
}

export function TerminalPaymentKeypadWithSettings({
  onCharge,
}: {
  readonly onCharge: ChargeHandler
}) {
  return (
    <Suspense fallback={null}>
      <TerminalPaymentKeypadSettingsLoader onCharge={onCharge} />
    </Suspense>
  )
}

function TerminalPaymentKeypadSettingsLoader({
  onCharge,
}: {
  readonly onCharge: ChargeHandler
}) {
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data

  return (
    <TerminalPaymentKeypad
      currency={settings?.fiatCurrency ?? FiatCurrency.CZK}
      onCharge={onCharge}
    />
  )
}

function AmountDisplay({
  amountDigitsAtom,
  currency,
}: {
  readonly amountDigitsAtom: AmountDigitsAtom
  readonly currency: FiatCurrency
}) {
  const amountDigits = useAtomValue(amountDigitsAtom)
  const exchangeRateQuote = useYadioBtcExchangeRate(currency)
  const locale = useLocale()

  const money = createMoney(amountDigits, currency)
  const btcMoney =
    exchangeRateQuote === null && money.value !== 0
      ? null
      : {
          currency: Currency.BTC,
          value: convertFiatMinorUnitsToSats(
            money.value,
            exchangeRateQuote?.exchangeRate ?? 1
          ),
        }

  return (
    <section className="flex flex-col items-center gap-5 text-center">
      <h1 className="text-6xl font-semibold tracking-normal tabular-nums">
        {formatMoney(money, locale)}
      </h1>
      <p className="text-xl text-foreground/80">
        {btcMoney === null ? "\u00A0" : formatMoney(btcMoney, locale)}
      </p>
    </section>
  )
}

function useYadioBtcExchangeRate(currency: FiatCurrency) {
  const [exchangeRateQuote, setExchangeRateQuote] =
    useState<ExchangeRateQuote | null>(null)

  useEffect(() => {
    const run = createRun(createFetchDep())
    let isDisposed = false

    async function refreshExchangeRate() {
      try {
        const result = await run(fetchYadioBtcExchangeRate(currency))
        if (isDisposed) return

        if (result.ok) {
          setExchangeRateQuote(result.value)
          return
        }

        console.error("Failed to fetch Yadio BTC exchange rate", result.error)
      } catch (error) {
        if (!isDisposed) {
          console.error("Failed to fetch Yadio BTC exchange rate", error)
        }
      }
    }

    void refreshExchangeRate()
    const intervalId = window.setInterval(() => {
      void refreshExchangeRate()
    }, rateRefreshIntervalMs)

    return () => {
      isDisposed = true
      window.clearInterval(intervalId)
      void run[Symbol.asyncDispose]()
    }
  }, [currency])

  return exchangeRateQuote
}

function Keypad({
  amountDigitsAtom,
  currency,
  isChargePending,
  onCharge,
}: {
  readonly amountDigitsAtom: AmountDigitsAtom
  readonly currency: FiatCurrency
  readonly isChargePending: boolean
  readonly onCharge: ChargeHandler
}) {
  const { t } = useTranslation()
  const store = useStore()
  const setAmountDigits = useSetAtom(amountDigitsAtom)

  function handleKeypadPress(key: KeypadKey) {
    vibrateOnKeypadPress()
    applyKeypadPress(setAmountDigits, key)
  }

  const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement)
    ) {
      return
    }

    if (numericKeyboardKeys.has(event.key)) {
      applyKeypadPress(setAmountDigits, event.key as KeypadKey)
      event.preventDefault()
      return
    }

    if (event.key === "Backspace") {
      applyKeypadPress(setAmountDigits, "<")
      event.preventDefault()
      return
    }

    if (event.key === "Delete" || event.key === "Escape") {
      applyKeypadPress(setAmountDigits, "C")
      event.preventDefault()
      return
    }

    if (event.key === "Enter") {
      const amountDigits = store.get(amountDigitsAtom)
      if (amountDigits !== "" && !isChargePending) {
        void onCharge(createMoney(amountDigits, currency))
      }
      event.preventDefault()
    }
  })

  useEffect(() => {
    window.addEventListener("keydown", handleKeydown)
    return () => {
      window.removeEventListener("keydown", handleKeydown)
    }
  }, [])

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
          className="h-16 rounded-full text-3xl text-foreground hover:bg-primary-foreground/10"
          onPointerDown={() => handleKeypadPress(key)}
        >
          {key}
        </Button>
      ))}
    </section>
  )
}

function ChargeButton({
  amountDigitsAtom,
  currency,
  isChargePending,
  onCharge,
}: {
  readonly amountDigitsAtom: AmountDigitsAtom
  readonly currency: FiatCurrency
  readonly isChargePending: boolean
  readonly onCharge: ChargeHandler
}) {
  const { t } = useTranslation()
  const amountDigits = useAtomValue(amountDigitsAtom)
  const money = createMoney(amountDigits, currency)

  return (
    <Button
      variant="outline"
      aria-busy={isChargePending}
      className="h-14 rounded-full text-base font-bold"
      disabled={amountDigits === "" || isChargePending}
      onClick={() => {
        void onCharge(money)
      }}
    >
      {isChargePending ? (
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      ) : null}
      {t("home.pay")}
    </Button>
  )
}
