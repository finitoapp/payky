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
