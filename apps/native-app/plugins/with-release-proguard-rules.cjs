const { appendFileSync, readFileSync } = require("node:fs")
const { join } = require("node:path")
const { withDangerousMod } = require("expo/config-plugins")

const marker = "# payky: release keep rules"

/**
 * R8 rules for the release build. j2objc annotations (Guava) are compile-time
 * only, and JNA's AWT window helpers exist only on desktop JVMs. JNA itself
 * binds native code by reflection, so its classes and the interfaces that
 * implement its callbacks must survive minification.
 */
const rules = `
${marker}
-dontwarn com.google.j2objc.annotations.ReflectionSupport
-dontwarn com.google.j2objc.annotations.RetainedWith
-dontwarn java.awt.**
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
`

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withReleaseProguardRules = (config) =>
  withDangerousMod(config, [
    "android",
    (modConfig) => {
      const file = join(
        modConfig.modRequest.platformProjectRoot,
        "app/proguard-rules.pro"
      )
      if (!readFileSync(file, "utf8").includes(marker))
        appendFileSync(file, rules)
      return modConfig
    },
  ])

module.exports = withReleaseProguardRules
