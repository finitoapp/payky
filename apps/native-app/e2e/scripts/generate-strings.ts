// Writes e2e/.generated/strings.js, which the `start` subflow loads with
// runScript, so flows name copy by its translation key (`output.t["pay.request"]`)
// as web's specs do with `translate("en", key)`.
import { resources } from "@payky/app-shared/i18n/resources"

const out = new URL("../.generated/strings.js", import.meta.url)
await Bun.write(
  out,
  `output.t = ${JSON.stringify(resources.en)}
// translateValue: output.tv("x.y", { value: "10%" }) fills {value}.
output.tv = function (key, params) {
  return output.t[key].replace(/\\{(\\w+)\\}/g, function (all, name) {
    return name in params ? String(params[name]) : all
  })
}
// A literal for a regex-only selector (\`id:\`): "Bank account (optional)".
output.re = function (text) {
  return text.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&")
}
`
)
