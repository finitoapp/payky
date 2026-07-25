export type PaymentMethodPreparationStatus =
  | { readonly status: "preparing" }
  | { readonly status: "failed"; readonly error: unknown }

export type PaymentMethodPreparationState = Readonly<
  Record<string, PaymentMethodPreparationStatus>
>

interface PaymentMethodPreparationTransition {
  readonly state: PaymentMethodPreparationState
  readonly shouldPrepare: boolean
}

interface PaymentMethodPreparationRunner {
  run(key: string, prepare: () => Promise<void>): Promise<void>
}

export const createPaymentMethodPreparationRunner =
  (): PaymentMethodPreparationRunner => {
    const inFlightAttempts = new Map<string, Promise<void>>()

    return {
      run(key, prepare) {
        const inFlightAttempt = inFlightAttempts.get(key)
        if (inFlightAttempt !== undefined) return inFlightAttempt

        let preparation: Promise<void>
        try {
          preparation = prepare()
        } catch (error) {
          preparation = Promise.reject(error)
        }

        const attempt = preparation.finally(() => {
          if (inFlightAttempts.get(key) === attempt) {
            inFlightAttempts.delete(key)
          }
        })
        inFlightAttempts.set(key, attempt)
        return attempt
      },
    }
  }

export const requestPaymentMethodPreparation = (
  state: PaymentMethodPreparationState,
  key: string
): PaymentMethodPreparationTransition => {
  if (state[key] !== undefined) {
    return { state, shouldPrepare: false }
  }

  return {
    state: { ...state, [key]: { status: "preparing" } },
    shouldPrepare: true,
  }
}

export const retryPaymentMethodPreparation = (
  state: PaymentMethodPreparationState,
  key: string
): PaymentMethodPreparationTransition => {
  if (state[key]?.status !== "failed") {
    return { state, shouldPrepare: false }
  }

  return {
    state: { ...state, [key]: { status: "preparing" } },
    shouldPrepare: true,
  }
}

export const failPaymentMethodPreparation = (
  state: PaymentMethodPreparationState,
  key: string,
  error: unknown
): PaymentMethodPreparationState => ({
  ...state,
  [key]: { status: "failed", error },
})

export const clearPaymentMethodPreparation = (
  state: PaymentMethodPreparationState,
  key: string
): PaymentMethodPreparationState => {
  if (state[key] === undefined) return state

  const { [key]: _cleared, ...remaining } = state
  return remaining
}
