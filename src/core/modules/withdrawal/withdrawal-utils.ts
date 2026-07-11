import { Address, NETWORK } from "@scure/btc-signer"

export const isValidBitcoinAddress = (address: string): boolean => {
  if (address.trim() === "") return false

  try {
    Address(NETWORK).decode(address)
    return true
  } catch {
    return false
  }
}

export const computeTotalDebitedSats = ({
  amountSats,
  withdrawAll,
  availableSats,
  feeSats,
}: {
  readonly amountSats: number
  readonly withdrawAll: boolean
  readonly availableSats: number
  readonly feeSats: number
}): number => (withdrawAll ? availableSats : amountSats + feeSats)
