import { isTauri } from "@tauri-apps/api/core"
import { vibrate } from "@tauri-apps/plugin-haptics"
import {
  atom,
  type PrimitiveAtom,
  useAtomValue,
  useSetAtom,
  useStore,
} from "jotai"
import { LoaderCircle } from "lucide-react"
import { motion, useAnimationControls, useReducedMotion } from "motion/react"
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
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  currencyFractionDigits,
  type Money,
} from "@/core/modules/shared/money.ts"
import {
  type Currency,
  FiatCurrency,
  Integer,
} from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

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
  ".",
  "0",
  "<",
] as const

const maxIntegerDigits = 9
const keypadVibrationMs = 10
const keypadButtonBubbleAnimation = {
  opacity: [0.28, 0.16, 0],
  scale: [0.25, 1.15, 1.65],
}
const amountChangeAnimation = {
  opacity: [0.6, 1, 1],
  scale: [0.94, 1.03, 1],
  y: [0, 0, 0],
}

type KeypadKey = (typeof keypad)[number]
type AmountInputAtom = PrimitiveAtom<string>
type SetAmountInput = (value: string | ((current: string) => string)) => void
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

const currencyNumberPartTypes = new Set<Intl.NumberFormatPartTypes>([
  "integer",
  "group",
  "decimal",
  "fraction",
])

function createMoney(amountInput: string, currency: Currency): Money {
  const fractionDigits = currencyFractionDigits[currency]
  const [integerPart = "", fractionPart = ""] = amountInput.split(".")
  const minorUnitsMultiplier = 10 ** fractionDigits
  const integerMinorUnits =
    Number(integerPart === "" ? "0" : integerPart) * minorUnitsMultiplier
  const fractionMinorUnits = Number(
    fractionPart.padEnd(fractionDigits, "0").slice(0, fractionDigits)
  )

  return {
    value: Integer(integerMinorUnits + fractionMinorUnits),
    currency,
  }
}

function getDecimalSeparator(locale: string) {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? "."
  )
}

function formatAmountInput(
  amountInput: string,
  currency: Currency,
  locale: string
) {
  const [integerPart = "0", fractionPart = ""] = amountInput.split(".")
  const hasDecimalSeparator = amountInput.includes(".")
  const formattedIntegerPart = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(Number(integerPart === "" ? "0" : integerPart))
  const decimalSeparator = getDecimalSeparator(locale)
  const amountText = hasDecimalSeparator
    ? `${formattedIntegerPart}${decimalSeparator}${fractionPart}`
    : formattedIntegerPart
  let hasRenderedAmount = false

  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: "currency",
  })
    .formatToParts(0)
    .map((part) => {
      if (!currencyNumberPartTypes.has(part.type)) return part.value
      if (hasRenderedAmount) return ""

      hasRenderedAmount = true
      return amountText
    })
    .join("")
}

function applyKeypadPress(
  setAmountInput: SetAmountInput,
  key: KeypadKey,
  currency: Currency
) {
  if (key === "<") {
    setAmountInput((current) => current.slice(0, -1))
    return
  }

  setAmountInput((current) => {
    if (key === ".") {
      if (current.includes(".")) return current

      return current === "" ? "0." : `${current}.`
    }

    const [integerPart = "", fractionPart] = current.split(".")

    if (fractionPart !== undefined) {
      if (fractionPart.length >= currencyFractionDigits[currency])
        return current

      return `${current}${key}`
    }

    if (integerPart.length >= maxIntegerDigits) return current
    if (current === "" && key === "0") return ""

    return `${current}${key}`
  })
}

function vibrateOnTerminalButtonPress() {
  if (!isTauri()) {
    navigator.vibrate?.(keypadVibrationMs)
    return
  }

  void vibrate(keypadVibrationMs)
}

export function TerminalPaymentKeypad({
  currency,
  onCharge,
}: {
  readonly currency: FiatCurrency
  readonly onCharge: ChargeHandler
}) {
  const amountInputAtom = useMemo(() => atom(""), [])
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
      <AmountDisplay amountInputAtom={amountInputAtom} currency={currency} />
      <Keypad
        amountInputAtom={amountInputAtom}
        currency={currency}
        isChargePending={isChargePending}
        onCharge={handleCharge}
      />
      <ChargeButton
        amountInputAtom={amountInputAtom}
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
  amountInputAtom,
  currency,
}: {
  readonly amountInputAtom: AmountInputAtom
  readonly currency: FiatCurrency
}) {
  const amountInput = useAtomValue(amountInputAtom)
  const locale = useLocale()
  const amountAnimationControls = useAnimationControls()
  const lastAnimatedAmountRef = useRef<string | null>(null)
  const shouldReduceMotion = useReducedMotion()

  const formattedAmount = formatAmountInput(amountInput, currency, locale)

  useEffect(() => {
    if (shouldReduceMotion) return
    if (lastAnimatedAmountRef.current === formattedAmount) return

    lastAnimatedAmountRef.current = formattedAmount

    amountAnimationControls.stop()
    void amountAnimationControls.start({
      ...amountChangeAnimation,
      transition: { duration: 0.32, ease: "easeOut", times: [0, 0.55, 1] },
    })
  }, [amountAnimationControls, formattedAmount, shouldReduceMotion])

  return (
    <section className="flex flex-col items-center gap-5 text-center">
      <motion.h1
        className="text-6xl font-semibold tracking-normal tabular-nums"
        animate={amountAnimationControls}
      >
        {formattedAmount}
      </motion.h1>
    </section>
  )
}

function Keypad({
  amountInputAtom,
  currency,
  isChargePending,
  onCharge,
}: {
  readonly amountInputAtom: AmountInputAtom
  readonly currency: FiatCurrency
  readonly isChargePending: boolean
  readonly onCharge: ChargeHandler
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const store = useStore()
  const setAmountInput = useSetAtom(amountInputAtom)
  const decimalSeparator = getDecimalSeparator(locale)

  function handleKeypadPress(key: KeypadKey) {
    if (isChargePending) return

    vibrateOnTerminalButtonPress()
    applyKeypadPress(setAmountInput, key, currency)
  }

  const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
    if (isChargePending) return

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
      applyKeypadPress(setAmountInput, event.key as KeypadKey, currency)
      event.preventDefault()
      return
    }

    if (event.key === "." || event.key === ",") {
      applyKeypadPress(setAmountInput, ".", currency)
      event.preventDefault()
      return
    }

    if (event.key === "Backspace") {
      applyKeypadPress(setAmountInput, "<", currency)
      event.preventDefault()
      return
    }

    if (event.key === "Delete" || event.key === "Escape") {
      setAmountInput("")
      event.preventDefault()
      return
    }

    if (event.key === "Enter") {
      const amountInput = store.get(amountInputAtom)
      const money = createMoney(amountInput, currency)
      if (money.value > 0 && !isChargePending) {
        void onCharge(money)
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
    if (key === ".") return t("home.keypad.decimal")
    if (key === "<") return t("home.keypad.backspace")

    return key
  }

  return (
    <section className="grid grid-cols-3 gap-x-0 gap-y-10">
      {keypad.map((key) => (
        <KeypadButton
          key={key}
          aria-label={getKeypadAriaLabel(key)}
          disabled={isChargePending}
          keypadKey={key}
          onPress={handleKeypadPress}
        >
          {key === "." ? decimalSeparator : key}
        </KeypadButton>
      ))}
    </section>
  )
}

function KeypadButton({
  "aria-label": ariaLabel,
  children,
  disabled,
  keypadKey,
  onPress,
}: {
  readonly "aria-label": string
  readonly children: string
  readonly disabled: boolean
  readonly keypadKey: KeypadKey
  readonly onPress: (key: KeypadKey) => void
}) {
  const bubbleAnimationControls = useAnimationControls()
  const shouldReduceMotion = useReducedMotion()

  return (
    <Button
      variant="ghost"
      aria-label={ariaLabel}
      className="relative size-24 -m-6 w-auto overflow-hidden rounded-full text-3xl text-foreground hover:bg-primary-foreground/10"
      disabled={disabled}
      onPointerDown={() => {
        if (disabled) return

        if (!shouldReduceMotion) {
          bubbleAnimationControls.stop()
          bubbleAnimationControls.set({ opacity: 0, scale: 0.25 })
          void bubbleAnimationControls.start({
            ...keypadButtonBubbleAnimation,
            transition: {
              duration: 0.34,
              ease: "easeOut",
              times: [0, 0.6, 1],
            },
          })
        }

        onPress(keypadKey)
      }}
    >
      <motion.span
        aria-hidden="true"
        className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 size-24 rounded-full bg-primary/20"
        initial={{ opacity: 0, scale: 0.25 }}
        animate={bubbleAnimationControls}
      />
      <span className="relative z-10">{children}</span>
    </Button>
  )
}

function ChargeButton({
  amountInputAtom,
  currency,
  isChargePending,
  onCharge,
}: {
  readonly amountInputAtom: AmountInputAtom
  readonly currency: FiatCurrency
  readonly isChargePending: boolean
  readonly onCharge: ChargeHandler
}) {
  const { t } = useTranslation()
  const amountInput = useAtomValue(amountInputAtom)
  const money = createMoney(amountInput, currency)

  return (
    <Button
      variant="outline"
      aria-busy={isChargePending}
      className="h-14 rounded-full text-base font-bold"
      disabled={money.value <= 0 || isChargePending}
      onClick={() => {
        vibrateOnTerminalButtonPress()
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
