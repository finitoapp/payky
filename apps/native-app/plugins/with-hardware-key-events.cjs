const { withMainActivity } = require("expo/config-plugins")

const MARKER = "payky.hardwareKey"

const IMPORTS = [
  "import android.view.KeyCharacterMap",
  "import android.view.KeyEvent",
  "import com.facebook.react.bridge.Arguments",
  "import com.facebook.react.modules.core.DeviceEventManagerModule",
]

/**
 * Every key the activity receives, forwarded unchanged to JS as a
 * `payky.hardwareKey` device event. A keyboard-wedge barcode scanner types a
 * code like a keyboard, and React Native has no global key listener; the
 * burst classification stays in JS (`@payky/app-shared/hardware-scan`, one
 * implementation with web). The event is never consumed, so nothing about
 * normal key handling changes. A soft keyboard commits text without key
 * events, so only hardware keys arrive here.
 */
const METHOD = `
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
      val key = when (event.keyCode) {
        KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
        KeyEvent.KEYCODE_SHIFT_LEFT, KeyEvent.KEYCODE_SHIFT_RIGHT -> "Shift"
        else -> {
          val char = event.unicodeChar
          if (char > 0 && (char and KeyCharacterMap.COMBINING_ACCENT) == 0)
            String(Character.toChars(char))
          else "Unidentified"
        }
      }
      reactHost?.currentReactContext?.let { context ->
        val payload = Arguments.createMap()
        payload.putString("key", key)
        payload.putDouble("timeStamp", event.eventTime.toDouble())
        context
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("${MARKER}", payload)
      }
    }
    return super.dispatchKeyEvent(event)
  }
`

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withHardwareKeyEvents = (config) =>
  withMainActivity(config, (activityConfig) => {
    const { language, contents } = activityConfig.modResults
    if (language !== "kt") throw new Error("MainActivity is not Kotlin")
    if (contents.includes(MARKER)) return activityConfig

    const imports = IMPORTS.filter((line) => !contents.includes(line))
    const withImports = contents.replace(
      /^(package .*\n)/mu,
      `$1\n${imports.join("\n")}\n`
    )
    const end = withImports.lastIndexOf("}")
    if (end === -1) throw new Error("MainActivity has no class body")
    activityConfig.modResults.contents =
      withImports.slice(0, end) + METHOD + withImports.slice(end)
    return activityConfig
  })

module.exports = withHardwareKeyEvents
