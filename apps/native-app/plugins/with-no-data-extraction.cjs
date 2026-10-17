const { mkdirSync, copyFileSync } = require("node:fs")
const { join } = require("node:path")
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins")

/**
 * Nothing this app stores may leave the device: both Evolu databases, the
 * account master keys included, live in its data directory. Mirrors the
 * Capacitor app's manifest. `allowBackup="false"` alone stops cloud backup but
 * not Android 12+ device-to-device transfer, hence the extraction rules too.
 *
 * @type {import("expo/config-plugins").ConfigPlugin}
 */
const withNoDataExtraction = (config) =>
  withDangerousMod(
    withAndroidManifest(config, (manifestConfig) => {
      const application = manifestConfig.modResults.manifest.application?.[0]
      if (application === undefined)
        throw new Error("AndroidManifest has no <application>")
      application.$["android:allowBackup"] = "false"
      application.$["android:dataExtractionRules"] =
        "@xml/data_extraction_rules"
      return manifestConfig
    }),
    [
      "android",
      (modConfig) => {
        const xmlDir = join(
          modConfig.modRequest.platformProjectRoot,
          "app/src/main/res/xml"
        )
        mkdirSync(xmlDir, { recursive: true })
        copyFileSync(
          join(__dirname, "data_extraction_rules.xml"),
          join(xmlDir, "data_extraction_rules.xml")
        )
        return modConfig
      },
    ]
  )

module.exports = withNoDataExtraction
