import * as React from "react"
import type { AiAssistantAccess } from "@/core/evolu/device-client.ts"
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
