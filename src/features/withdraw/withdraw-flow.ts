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
      return state.step === "review"
        ? { ...state, exitSpeed: action.exitSpeed }
        : state
    case "CONFIRM_STARTED":
      return state.step === "review"
        ? { ...state, confirming: true, confirmError: null }
        : state
    case "CONFIRM_FAILED":
      return state.step === "review"
        ? { ...state, confirming: false, confirmError: action.error }
        : state
    case "CONFIRM_FINISHED":
      return state.step === "review" ? { ...state, confirming: false } : state
    case "SHOW_RESULT":
      return { step: "result", result: action.result }
  }
}
