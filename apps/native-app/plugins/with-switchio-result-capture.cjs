const { withMainActivity } = require("expo/config-plugins")

const MARKER = "SwitchioResultStore.save"

const IMPORTS = [
  "import android.content.Intent",
  "import me.payky.switchio.SwitchioResultStore",
]

/**
 * Writes every SwitchioPay activity result to durable storage before React,
 * Expo or the module are involved. If Android killed this app while the
 * terminal was in the foreground, the result is delivered to the recreated
 * activity before any JS runs; storing it here is what lets JS settle the
 * payment afterwards (`payky-switchio` `peekStoredResult`). The result is
 * passed on unchanged, so the module's own promise path still works.
 *
 * @type {import("expo/config-plugins").ConfigPlugin}
 */
const METHOD = `
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == SwitchioResultStore.REQUEST_CODE) {
      SwitchioResultStore.save(
        this,
        resultCode,
        data?.getStringExtra(SwitchioResultStore.RESULT_KEY)
      )
    }
    super.onActivityResult(requestCode, resultCode, data)
  }
`

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withSwitchioResultCapture = (config) =>
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

module.exports = withSwitchioResultCapture
