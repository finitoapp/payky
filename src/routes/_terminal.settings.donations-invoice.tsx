import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { DonationsInvoiceSettingsPage } from "@/features/settings/donations/donations-invoice-settings-page.tsx"

const DonateInvoiceSearchSchema = z.object({
  invoice: z.string().trim().min(1).optional().default(""),
  verify: z
    .string()
    .trim()
    .refine(
      (value) => value.length === 0 || z.url().safeParse(value).success,
      "Expected a valid verify URL."
    )
    .optional()
    .default(""),
})

export const Route = createFileRoute("/_terminal/settings/donations-invoice")({
  component: DonationsInvoiceRoute,
  validateSearch: (search) => DonateInvoiceSearchSchema.parse(search),
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function DonationsInvoiceRoute() {
  const { invoice, verify } = Route.useSearch()

  return <DonationsInvoiceSettingsPage invoice={invoice} verify={verify} />
}
