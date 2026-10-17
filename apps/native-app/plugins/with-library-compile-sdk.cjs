const { withProjectBuildGradle } = require("expo/config-plugins")

const marker = "// payky: library compileSdk"

/**
 * React Native 0.88's AAR metadata requires every library to compile against
 * API 34+, and @buildonspark/spark-sdk hard-codes compileSdkVersion 33, which
 * fails the release build. Compile all Android libraries against the app's
 * compileSdk instead of patching the SDK; their minSdk/targetSdk are untouched.
 *
 * @type {import("expo/config-plugins").ConfigPlugin}
 */
const withLibraryCompileSdk = (config) =>
  withProjectBuildGradle(config, (gradleConfig) => {
    if (!gradleConfig.modResults.contents.includes(marker)) {
      gradleConfig.modResults.contents += `
${marker}
subprojects { project ->
  project.plugins.withId("com.android.library") {
    project.androidComponents.finalizeDsl { extension ->
      extension.compileSdk = rootProject.ext.compileSdkVersion
    }
  }
}
`
    }
    return gradleConfig
  })

module.exports = withLibraryCompileSdk
