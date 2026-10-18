import type { DeviceTheme } from "@payky/core/evolu/device-client"

/** The Tamagui theme and status bar to draw: `system` follows the OS scheme. */
export const resolveTheme = (
  preference: DeviceTheme,
  systemScheme: "light" | "dark" | null | undefined
): "light" | "dark" =>
  preference === "system"
    ? systemScheme === "dark"
      ? "dark"
      : "light"
    : preference
