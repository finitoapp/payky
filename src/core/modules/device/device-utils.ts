import type { DeviceLanguage } from "@/core/evolu/device-client.ts"

export function getPreferredDeviceLanguage(
  navigatorLanguage: string
): DeviceLanguage {
  if (navigatorLanguage.startsWith("cs")) {
    return "cs"
  }

  if (navigatorLanguage.startsWith("sk")) {
    return "sk"
  }

  return "en"
}
