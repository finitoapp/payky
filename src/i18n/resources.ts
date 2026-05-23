export const resources = {
  en: {
    "activity.description":
      "A compact stream of payments, requests, and settlement updates.",
    "activity.empty": "No activity yet",
    "activity.feed.approved": "Coffee fund request approved",
    "activity.feed.paid": "Group dinner paid",
    "activity.feed.synced": "Budget sync completed",
    "activity.title": "Activity",
    "app.name": "Payky",
    "home.balance.label": "Shared balance",
    "home.balance.value": "CZK 4,820",
    "home.description":
      "Track shared expenses, settle quickly, and keep payment context in one place.",
    "home.request": "Create request",
    "home.settle": "Settle up",
    "home.title": "Overview",
    "nav.activity": "Activity",
    "nav.home": "Overview",
  },
  cs: {
    "activity.description":
      "Strucny prehled plateb, zadosti a aktualizaci vyrovnani.",
    "activity.empty": "Zatim zadna aktivita",
    "activity.feed.approved": "Zadost do fondu na kavu byla schvalena",
    "activity.feed.paid": "Skupinova vecere zaplacena",
    "activity.feed.synced": "Synchronizace rozpoctu dokoncena",
    "activity.title": "Aktivita",
    "app.name": "Payky",
    "home.balance.label": "Sdileny zustatek",
    "home.balance.value": "4 820 Kc",
    "home.description":
      "Sledujte sdilene vydaje, rychle je vyrovnejte a mejte kontext plateb na jednom miste.",
    "home.request": "Vytvorit zadost",
    "home.settle": "Vyrovnat",
    "home.title": "Prehled",
    "nav.activity": "Aktivita",
    "nav.home": "Prehled",
  },
} as const

export type Language = keyof typeof resources
export type TranslationKey = keyof (typeof resources)["en"]
