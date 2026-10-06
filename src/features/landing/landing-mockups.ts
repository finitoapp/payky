import type { Language } from "@/i18n/resources.ts"
import czechHomeMockup from "../../../docs/mockup/cs/home.webp"
import czechPaidMockup from "../../../docs/mockup/cs/paid.webp"
import czechPaymentMockup from "../../../docs/mockup/cs/payment.webp"
import homeMockup from "../../../docs/mockup/en/home.webp"
import paidMockup from "../../../docs/mockup/en/paid.webp"
import paymentMockup from "../../../docs/mockup/en/payment.webp"
import slovakHomeMockup from "../../../docs/mockup/sk/home.webp"
import slovakPaidMockup from "../../../docs/mockup/sk/paid.webp"
import slovakPaymentMockup from "../../../docs/mockup/sk/payment.webp"

/** The app screens the page shows, as `bin/generate-doc-screenshots.ts` captures them. */
export type MockupScreen = "home" | "payment" | "paid"

export type LandingMockups = Readonly<Record<MockupScreen, string>>

export const mockupsByLanguage: Readonly<Record<Language, LandingMockups>> = {
  cs: {
    home: czechHomeMockup,
    paid: czechPaidMockup,
    payment: czechPaymentMockup,
  },
  en: {
    home: homeMockup,
    paid: paidMockup,
    payment: paymentMockup,
  },
  sk: {
    home: slovakHomeMockup,
    paid: slovakPaidMockup,
    payment: slovakPaymentMockup,
  },
}
