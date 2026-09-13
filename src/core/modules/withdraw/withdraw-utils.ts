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
