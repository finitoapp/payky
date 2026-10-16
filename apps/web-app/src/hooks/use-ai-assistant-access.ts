import type { AiAssistantAccess } from "@payky/core/evolu/device-client"
import * as React from "react"
import {
  useDeviceSettings,
  useUpdateDeviceSettings,
} from "@/hooks/use-device-settings.ts"

export function useAiAssistantAccess(): AiAssistantAccess {
  return useDeviceSettings().aiAssistantAccess
}

export function useSetAiAssistantAccess() {
  const updateDeviceSettings = useUpdateDeviceSettings()

  return React.useCallback(
    (aiAssistantAccess: AiAssistantAccess) => {
      updateDeviceSettings({ aiAssistantAccess })
    },
    [updateDeviceSettings]
  )
}
