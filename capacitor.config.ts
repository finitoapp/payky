import type { CapacitorConfig } from "@capacitor/cli"

const liveReloadUrl = process.env.PAYKY_CAPACITOR_SERVER_URL

const config: CapacitorConfig = {
  appId: "me.payky",
  appName: "Payky",
  webDir: "dist",
  server: {
    androidScheme: "https",
    ...(liveReloadUrl !== undefined ? { url: liveReloadUrl } : {}),
  },
}

export default config
