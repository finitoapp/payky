import type { WithdrawalQuote } from "@/core/modules/withdrawal/withdrawal-actions.ts"
import type { SparkExitSpeed } from "@/core/spark/spark-wallet.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export interface WithdrawResult {
  readonly txid: string | null
  readonly status: string
}

export type WithdrawState =
  | { readonly step: "form" }
  | {
      readonly step: "review"
      readonly address: string
      readonly quote: WithdrawalQuote
      readonly exitSpeed: SparkExitSpeed
      readonly confirming: boolean
      readonly confirmError: TranslationKey | null
    }
  | { readonly step: "result"; readonly result: WithdrawResult }

export type WithdrawAction =
  | {
      readonly type: "OPEN_REVIEW"
      readonly address: string
      readonly quote: WithdrawalQuote
    }
  | { readonly type: "BACK" }
  | { readonly type: "SET_EXIT_SPEED"; readonly exitSpeed: SparkExitSpeed }
  | { readonly type: "CONFIRM_STARTED" }
  | { readonly type: "CONFIRM_FAILED"; readonly error: TranslationKey }
  | { readonly type: "CONFIRM_FINISHED" }
  | { readonly type: "SHOW_RESULT"; readonly result: WithdrawResult }

export const initialWithdrawState: WithdrawState = { step: "form" }

type WithdrawReviewState = Extract<WithdrawState, { step: "review" }>

/**
 * SET_EXIT_SPEED/CONFIRM_* are only ever dispatched from the review step's UI,
 * which only exists while `state.step === "review"`. Asserting instead of
 * silently no-op'ing on a mismatch surfaces a real bug immediately rather
 * than swallowing it.
 */
const assertReviewState = (state: WithdrawState): WithdrawReviewState => {
  if (state.step !== "review") {
    throw new Error(
      `withdrawReducer: expected step "review", got "${state.step}"`
    )
  }
  return state
}

export const withdrawReducer = (
  state: WithdrawState,
  action: WithdrawAction
): WithdrawState => {
  switch (action.type) {
    case "OPEN_REVIEW":
      return {
        step: "review",
        address: action.address,
        quote: action.quote,
        exitSpeed: "medium",
        confirming: false,
        confirmError: null,
      }
    case "BACK":
      return initialWithdrawState
    case "SET_EXIT_SPEED":
      return { ...assertReviewState(state), exitSpeed: action.exitSpeed }
    case "CONFIRM_STARTED":
      return {
        ...assertReviewState(state),
        confirming: true,
        confirmError: null,
      }
    case "CONFIRM_FAILED":
      return {
        ...assertReviewState(state),
        confirming: false,
        confirmError: action.error,
      }
    case "CONFIRM_FINISHED":
      return { ...assertReviewState(state), confirming: false }
    case "SHOW_RESULT":
      return { step: "result", result: action.result }
  }
}
