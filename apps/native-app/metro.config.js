const { getDefaultConfig } = require("expo/metro-config")
const path = require("node:path")

const config = getDefaultConfig(__dirname)

// Workspace packages (@payky/app-shared) declare react as a peer, so Bun gives
// them their own copy; a second React in the bundle breaks hooks. Resolve
// react from this app for every importer.
const appOrigin = path.join(__dirname, "package.json")
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromApp =
    moduleName === "react" || moduleName.startsWith("react/")
      ? { ...context, originModulePath: appOrigin }
      : context
  return fromApp.resolveRequest(fromApp, moduleName, platform)
}

module.exports = config
