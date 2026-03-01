# App Icons

All icon files in this directory are generated from the dashboard's `favicon.svg`
(a gradient shield + stylised Y/Yeoman mark, sky-blue → violet).

## Files

| File | Size | Platform |
|------|------|----------|
| `32x32.png` | 32×32 px | Windows taskbar / Linux |
| `128x128.png` | 128×128 px | Windows / Linux |
| `128x128@2x.png` | 256×256 px | macOS Retina |
| `icon.png` | 512×512 px | System tray (all platforms) |
| `icon.ico` | multi-size (16–256 px) | Windows installer |
| `icon.icns` | multi-size (16–1024 px) | macOS bundle |
| `icon.svg` | vector | Source (copied from `packages/dashboard/public/favicon.svg`) |

## Regenerating Icons

If the dashboard favicon changes, regenerate everything from the repo root:

```bash
# Requirements: rsvg-convert (librsvg) + Python 3 with Pillow
#   Arch/Manjaro:  sudo pacman -S librsvg python-pillow
#   Debian/Ubuntu: sudo apt install librsvg2-bin python3-pillow
#   macOS:         brew install librsvg && pip3 install Pillow

SVG="packages/dashboard/public/favicon.svg"
ICONS="packages/desktop/src-tauri/icons"

cp "$SVG" "$ICONS/icon.svg"
rsvg-convert -w 32   -h 32   "$SVG" -o "$ICONS/32x32.png"
rsvg-convert -w 128  -h 128  "$SVG" -o "$ICONS/128x128.png"
rsvg-convert -w 256  -h 256  "$SVG" -o "$ICONS/128x128@2x.png"
rsvg-convert -w 512  -h 512  "$SVG" -o "$ICONS/icon.png"

# Then run the Python snippet in scripts/generate-icons.py to produce .ico and .icns
python3 scripts/generate-icons.py
```

Alternatively, use the Tauri CLI's built-in icon generator (requires a 512×512 PNG source):

```bash
cd packages/desktop
npx @tauri-apps/cli icon src-tauri/icons/icon.png
```

This overwrites all icon files with Tauri-optimised versions.
