#!/usr/bin/env python3
"""
Generate icon.ico and icon.icns for the Tauri desktop app from a source PNG.

Usage:
  python3 scripts/generate-icons.py [source_png]

Defaults to packages/desktop/src-tauri/icons/icon.png as the source.
Outputs icon.ico and icon.icns into the same directory.

Requirements: Pillow  (pip install Pillow)
"""

import io
import os
import struct
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
ICONS_DIR = REPO_ROOT / "packages" / "desktop" / "src-tauri" / "icons"


def make_ico(src_path: Path, out_path: Path) -> None:
    try:
        from PIL import Image
    except ImportError:
        print("ERROR: Pillow not installed. Run: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    src = Image.open(src_path).convert("RGBA")
    sizes = [16, 32, 48, 64, 128, 256]
    blobs: list[bytes] = []
    for s in sizes:
        buf = io.BytesIO()
        src.resize((s, s), Image.LANCZOS).save(buf, format="PNG")
        blobs.append(buf.getvalue())

    # Build ICO manually (Pillow's built-in ICO is single-size only)
    header = struct.pack("<HHH", 0, 1, len(sizes))
    dir_offset = 6 + 16 * len(sizes)
    offsets, cur = [], dir_offset
    for blob in blobs:
        offsets.append(cur)
        cur += len(blob)

    entries = b""
    for s, blob, off in zip(sizes, blobs, offsets):
        w = s if s < 256 else 0
        h = s if s < 256 else 0
        entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(blob), off)

    with open(out_path, "wb") as f:
        f.write(header + entries + b"".join(blobs))

    print(f"  {out_path.name}: {out_path.stat().st_size:,} bytes  ({len(sizes)} sizes)")


def make_icns(src_path: Path, out_path: Path) -> None:
    try:
        from PIL import Image
    except ImportError:
        print("ERROR: Pillow not installed. Run: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    # ICNS icon type tags and their pixel dimensions
    icon_types = [
        (b"icp4", 16),
        (b"icp5", 32),
        (b"ic07", 128),
        (b"ic08", 256),
        (b"ic09", 512),
        (b"ic10", 1024),
    ]
    src = Image.open(src_path).convert("RGBA")
    icon_data = b""
    for tag, size in icon_types:
        buf = io.BytesIO()
        src.resize((size, size), Image.LANCZOS).save(buf, format="PNG")
        png_bytes = buf.getvalue()
        entry_len = 8 + len(png_bytes)
        icon_data += tag + struct.pack(">I", entry_len) + png_bytes

    total_len = 8 + len(icon_data)
    with open(out_path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", total_len) + icon_data)

    print(f"  {out_path.name}: {out_path.stat().st_size:,} bytes  ({len(icon_types)} sizes)")


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ICONS_DIR / "icon.png"
    if not src.exists():
        print(f"ERROR: Source PNG not found: {src}", file=sys.stderr)
        sys.exit(1)

    print(f"Source: {src}")
    make_ico(src, ICONS_DIR / "icon.ico")
    make_icns(src, ICONS_DIR / "icon.icns")
    print("Done.")


if __name__ == "__main__":
    main()
