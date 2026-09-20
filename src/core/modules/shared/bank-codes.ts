import {
  type BankQrFormat,
  FiatCurrency,
} from "@/core/modules/shared/schema.ts"

/**
 * Bank names by the four-digit bank code an IBAN carries right after its
 * check digits in the two countries whose account numbers Payky accepts
 * (`CZ` per ČNB's payment system code list, `SK` per NBS's). Only for the
 * confirmation hint under the account field: a code missing here is not an
 * error, the account is still accepted.
 */
const czechBanks: Readonly<Record<string, string>> = {
  "0100": "Komerční banka",
  "0300": "ČSOB",
  "0600": "MONETA Money Bank",
  "0710": "Česká národní banka",
  "0800": "Česká spořitelna",
  "2010": "Fio banka",
  "2060": "Citfin",
  "2070": "TRINITY BANK",
  "2100": "Hypoteční banka",
  "2200": "Peněžní dům",
  "2220": "Artesa",
  "2250": "Banka CREDITAS",
  "2260": "NEY spořitelní družstvo",
  "2275": "Podnikatelská družstevní záložna",
  "2600": "Citibank Europe",
  "2700": "UniCredit Bank",
  "3030": "Air Bank",
  "3050": "BNP Paribas Personal Finance",
  "3060": "PKO BP",
  "3500": "ING Bank",
  "4000": "Max banka",
  "4300": "Národní rozvojová banka",
  "5500": "Raiffeisenbank",
  "5800": "J&T BANKA",
  "6000": "PPF banka",
  "6100": "Raiffeisenbank (Equa bank)",
  "6200": "COMMERZBANK",
  "6210": "mBank",
  "6300": "BNP Paribas",
  "6700": "Všeobecná úverová banka",
  "7910": "Deutsche Bank",
  "7950": "Raiffeisen stavební spořitelna",
  "7960": "ČSOB Stavební spořitelna",
  "7970": "MONETA Stavební Spořitelna",
  "7990": "Modrá pyramida",
  "8030": "Raiffeisenbank im Stiftland",
  "8040": "Oberbank",
  "8060": "Stavební spořitelna České spořitelny",
  "8090": "Česká exportní banka",
  "8150": "HSBC",
  "8190": "Sparkasse Oberlausitz-Niederschlesien",
  "8199": "MUFG Bank",
  "8200": "PRIVAT BANK der Raiffeisenlandesbank",
  "8220": "Payment execution",
  "8230": "EEPAYS",
  "8240": "Družstevní záložna Kredit",
  "8250": "Bank of China",
  "8255": "Bank of Communications",
  "8265": "Industrial and Commercial Bank of China",
  "8270": "Fairplay Pay",
  "8280": "B-Efekt",
  "8293": "Mercurius Partners",
  "8299": "BESTPAY",
  "8500": "Multitude Bank",
}

const slovakBanks: Readonly<Record<string, string>> = {
  "0200": "Všeobecná úverová banka",
  "0720": "Národná banka Slovenska",
  "0900": "Slovenská sporiteľňa",
  "1100": "Tatra banka",
  "1111": "UniCredit Bank",
  "3000": "Slovenská záručná a rozvojová banka",
  "3100": "Prima banka Slovensko",
  "5200": "OTP Banka Slovensko",
  "5600": "Prima banka Slovensko",
  "6500": "365.bank",
  "7300": "ING Bank",
  "7500": "Československá obchodná banka",
  "7930": "Wüstenrot stavebná sporiteľňa",
  "8100": "Komerční banka",
  "8120": "Privatbanka",
  "8130": "Citibank Europe",
  "8160": "EXIMBANKA SR",
  "8170": "ČSOB stavebná sporiteľňa",
  "8180": "Štátna pokladnica",
  "8191": "Prvá stavebná sporiteľňa",
  "8320": "J&T BANKA",
  "8330": "Fio banka",
  "8360": "mBank",
  "8370": "Oberbank",
  "8420": "BKS Bank",
  "8430": "KDB Bank Europe",
}

const banksByCountry: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  CZ: czechBanks,
  SK: slovakBanks,
}

/**
 * What a bank account implies for payments: the currency its transfers are
 * in and the QR standard its bank apps scan — Czech accounts SPAYD in CZK,
 * Slovak accounts PAY by square in EUR, anything else a SEPA transfer in EUR
 * with a SPAYD QR. Nothing a merchant should have to pick by hand.
 */
export const getBankAccountDefaults = (
  iban: string
): {
  readonly currency: FiatCurrency
  readonly defaultQrFormat: BankQrFormat
} => {
  const country = iban.replaceAll(/\s/gu, "").slice(0, 2).toUpperCase()
  if (country === "CZ") {
    return { currency: FiatCurrency.CZK, defaultQrFormat: "spayd" }
  }
  if (country === "SK") {
    return { currency: FiatCurrency.EUR, defaultQrFormat: "payBySquare1_2_0" }
  }
  return { currency: FiatCurrency.EUR, defaultQrFormat: "spayd" }
}

/** The bank behind a `CZ`/`SK` IBAN, or `null` when unknown to this table. */
export const getBankNameForIban = (iban: string): string | null => {
  const normalized = iban.replaceAll(/\s/gu, "").toUpperCase()
  const banks = banksByCountry[normalized.slice(0, 2)]
  if (banks === undefined) return null
  return banks[normalized.slice(4, 8)] ?? null
}
