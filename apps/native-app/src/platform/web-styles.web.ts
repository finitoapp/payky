/**
 * The scrollbar of web-app's `index.css` ("Custom Scrollbar"): thin, on a
 * transparent track, in the theme's `input` color, which Tamagui exposes as
 * `--input` for the active light or dark theme. React Native has no style
 * for a scrollbar, so the rules go into the page's head.
 */
const style = document.createElement("style")
style.textContent = `
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--input); border-radius: 5px; }
* { scrollbar-width: thin; scrollbar-color: var(--input) transparent; }
`
document.head.append(style)
