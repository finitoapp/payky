#!/usr/bin/env bash
# Generates the front print for a black t-shirt: t-shirt.svg (text as paths) and t-shirt.png.
# Requires: curl, rsvg-convert (librsvg), magick (ImageMagick), inkscape.
set -euo pipefail
cd "$(dirname "$0")/.."

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export XDG_DATA_HOME="$work/fontroot"
mkdir -p "$XDG_DATA_HOME/fonts"

for weight in Bold Medium; do
  curl -sfL "https://github.com/google/fonts/raw/main/ofl/firasans/FiraSans-$weight.ttf" \
    -o "$XDG_DATA_HOME/fonts/FiraSans-$weight.ttf"
done
fc-cache -f >/dev/null

# Nest the app icon into the print canvas and set the type below it.
python3 - "$work" <<'PY'
import pathlib, sys
work = sys.argv[1]
logo = pathlib.Path("public/pwa-icon.svg").read_text()
# Flatten the icon's nested <svg> elements into <g transform=...>: many editors
# (Illustrator, Corel, some viewers) drop nested <svg> and the logo goes missing.
replacements = [
    ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 896 896" role="img" aria-labelledby="title desc">',
     '<g transform="translate(600,380) scale(%.10f)">' % (1800 / 896)),
    ('<svg x="7" y="0" width="882" height="896" viewBox="0 0 882 896" aria-hidden="true" focusable="false">',
     '<g transform="translate(7,0)">'),
    ('<rect width="882" height="896" fill="transparent"/>', ''),  # Inkscape paints this black
]
for old, new_frag in replacements:
    assert old in logo, f"public/pwa-icon.svg changed, cannot patch: {old[:60]}"
    logo = logo.replace(old, new_frag, 1)
logo = logo.rstrip().removesuffix("</svg>").rstrip().removesuffix("</svg>") + "</g></g>"

pathlib.Path(f"{work}/print.svg").write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3600" viewBox="0 0 3000 3600">
  {logo}
  <g text-anchor="middle" font-family="Fira Sans" font-variant-ligatures="none">
    <text x="1500" y="2830" font-weight="bold" font-size="430" letter-spacing="-4" fill="#FFFFFF">Payky</text>
    <text x="1484" y="3120" font-size="85" font-weight="500" letter-spacing="32" fill="#D99A22">Payments you finally own</text>
  </g>
</svg>''')
PY

rsvg-convert -w 3000 -h 3600 -o "$work/print.png" "$work/print.svg"
magick "$work/print.png" -trim +repage -bordercolor none -border 200 t-shirt.png

# Same artwork as SVG: fonts converted to paths, cropped to the PNG's trim box.
inkscape "$work/print.svg" --export-type=svg --export-plain-svg --export-filename="$work/paths.svg" \
  --actions="select-all:all;object-to-path;export-do" >/dev/null
python3 - "$work" "$(magick "$work/print.png" -format '%@' info:)" <<'PY'
import pathlib, re, sys
work, bbox = sys.argv[1], sys.argv[2]
w, h, x, y = map(int, re.match(r"(\d+)x(\d+)\+(\d+)\+(\d+)", bbox).groups())
margin = 200
x, y, w, h = x - margin, y - margin, w + 2 * margin, h + 2 * margin
svg = pathlib.Path(f"{work}/paths.svg").read_text()
svg = re.sub(
    r'width="[\d.]+"\n(\s*)height="[\d.]+"\n\s*viewBox="[^"]+"',
    f'width="{w}"\n\\1height="{h}"\n\\1viewBox="{x} {y} {w} {h}"',
    svg,
    count=1,
)
pathlib.Path("t-shirt.svg").write_text(svg)
PY

identify t-shirt.png
rsvg-convert -w 300 t-shirt.svg -o "$work/check.png" && identify t-shirt.svg
