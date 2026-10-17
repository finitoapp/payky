const { getDefaultConfig } = require("expo/metro-config")
const path = require("node:path")

const config = getDefaultConfig(__dirname)

// Workspace packages (@payky/app-shared) declare react and jotai as peers, so Bun gives
// them their own copy; a second React or Jotai in the bundle breaks hooks and
// the store. Resolve both from this app for every importer.
const appOrigin = path.join(__dirname, "package.json")
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromApp =
    moduleName === "react" ||
    moduleName.startsWith("react/") ||
    moduleName === "jotai" ||
    moduleName.startsWith("jotai/")
      ? { ...context, originModulePath: appOrigin }
      : context
  return fromApp.resolveRequest(fromApp, moduleName, platform)
}

module.exports = config
