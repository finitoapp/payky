import type { Language } from "@/i18n/resources.ts"
import czechBillMockup from "../../../docs/mockup/cs/bill.webp"
import czechHomeMockup from "../../../docs/mockup/cs/home.webp"
import czechItemsMockup from "../../../docs/mockup/cs/items.webp"
import czechPaidMockup from "../../../docs/mockup/cs/paid.webp"
import czechPaymentMockup from "../../../docs/mockup/cs/payment.webp"
import czechSplitMockup from "../../../docs/mockup/cs/split.webp"
import czechStatsMockup from "../../../docs/mockup/cs/stats.webp"
import czechStatsChartsMockup from "../../../docs/mockup/cs/stats-charts.webp"
import czechTableBillMockup from "../../../docs/mockup/cs/table-bill.webp"
import czechTablesMockup from "../../../docs/mockup/cs/tables.webp"
import billMockup from "../../../docs/mockup/en/bill.webp"
import homeMockup from "../../../docs/mockup/en/home.webp"
import itemsMockup from "../../../docs/mockup/en/items.webp"
import paidMockup from "../../../docs/mockup/en/paid.webp"
import paymentMockup from "../../../docs/mockup/en/payment.webp"
import splitMockup from "../../../docs/mockup/en/split.webp"
import statsMockup from "../../../docs/mockup/en/stats.webp"
import statsChartsMockup from "../../../docs/mockup/en/stats-charts.webp"
import tableBillMockup from "../../../docs/mockup/en/table-bill.webp"
import tablesMockup from "../../../docs/mockup/en/tables.webp"
import slovakBillMockup from "../../../docs/mockup/sk/bill.webp"
import slovakHomeMockup from "../../../docs/mockup/sk/home.webp"
import slovakItemsMockup from "../../../docs/mockup/sk/items.webp"
import slovakPaidMockup from "../../../docs/mockup/sk/paid.webp"
import slovakPaymentMockup from "../../../docs/mockup/sk/payment.webp"
import slovakSplitMockup from "../../../docs/mockup/sk/split.webp"
import slovakStatsMockup from "../../../docs/mockup/sk/stats.webp"
import slovakStatsChartsMockup from "../../../docs/mockup/sk/stats-charts.webp"
import slovakTableBillMockup from "../../../docs/mockup/sk/table-bill.webp"
import slovakTablesMockup from "../../../docs/mockup/sk/tables.webp"

/** The app screens the page shows, as `bin/generate-doc-screenshots.ts` captures them. */
export type MockupScreen =
  | "bill"
  | "home"
  | "items"
  | "paid"
  | "payment"
  | "split"
  | "stats"
  | "statsCharts"
  | "tableBill"
  | "tables"

/** Every mockup's pixel size, so the page reserves its space before it loads. */
export const mockupWidth = 1164
export const mockupHeight = 2044

export type LandingMockups = Readonly<Record<MockupScreen, string>>

export const mockupsByLanguage: Readonly<Record<Language, LandingMockups>> = {
  cs: {
    bill: czechBillMockup,
    home: czechHomeMockup,
    items: czechItemsMockup,
    paid: czechPaidMockup,
    payment: czechPaymentMockup,
    split: czechSplitMockup,
    stats: czechStatsMockup,
    statsCharts: czechStatsChartsMockup,
    tableBill: czechTableBillMockup,
    tables: czechTablesMockup,
  },
  en: {
    bill: billMockup,
    home: homeMockup,
    items: itemsMockup,
    paid: paidMockup,
    payment: paymentMockup,
    split: splitMockup,
    stats: statsMockup,
    statsCharts: statsChartsMockup,
    tableBill: tableBillMockup,
    tables: tablesMockup,
  },
  sk: {
    bill: slovakBillMockup,
    home: slovakHomeMockup,
    items: slovakItemsMockup,
    paid: slovakPaidMockup,
    payment: slovakPaymentMockup,
    split: slovakSplitMockup,
    stats: slovakStatsMockup,
    statsCharts: slovakStatsChartsMockup,
    tableBill: slovakTableBillMockup,
    tables: slovakTablesMockup,
  },
}
