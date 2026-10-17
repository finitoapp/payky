// babel-preset-expo leaves `using` declarations alone, and Hermes cannot run them.
export default function babelConfig(api) {
  api.cache(true)
  return {
    presets: ["babel-preset-expo"],
    plugins: ["@babel/plugin-transform-explicit-resource-management"],
  }
}
