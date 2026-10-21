const { withAndroidManifest } = require("expo/config-plugins")

/**
 * The e2e build (EXPO_PUBLIC_PAYKY_E2E=1) talks plain HTTP to the local mock
 * server (e2e/scripts/mock-server.ts), which a release build blocks by
 * default. Any other build keeps cleartext off.
 *
 * @type {import("expo/config-plugins").ConfigPlugin}
 */
const withE2eCleartext = (config) =>
  withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0]
    if (application === undefined)
      throw new Error("AndroidManifest has no <application>")
    if (process.env.EXPO_PUBLIC_PAYKY_E2E === "1")
      application.$["android:usesCleartextTraffic"] = "true"
    else delete application.$["android:usesCleartextTraffic"]
    return manifestConfig
  })

module.exports = withE2eCleartext
