#!/usr/bin/env python3
"""tools/make-favicon.py - the game logo as a favicon, generated not drawn.

Reads assets/icons/icon_logo.png (installed from the gamespec's art like
everything else under assets/) and writes favicon.ico at the repo root with
32px and 16px frames. Run once and commit the output; the .ico is committed
rather than built by CI because there is no build step here, by design.

    py -3 tools/make-favicon.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "icons" / "icon_logo.png"
TARGET = ROOT / "favicon.ico"


def main() -> None:
    logo = Image.open(SOURCE).convert("RGBA")
    # Square it on a transparent canvas first, so a rectangular logo scales
    # without being squashed.
    side = max(logo.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2))
    canvas.save(TARGET, sizes=[(32, 32), (16, 16)])
    print(f"wrote {TARGET.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
