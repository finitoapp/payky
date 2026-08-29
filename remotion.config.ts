import { Config } from "@remotion/cli/config"
import { paykyWebpackOverride } from "./remotion/webpack-override.ts"

Config.setEntryPoint("remotion/index.ts")
Config.setPublicDir("remotion/public")
Config.overrideWebpackConfig(paykyWebpackOverride)
