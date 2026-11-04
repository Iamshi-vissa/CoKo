#!/usr/bin/env python3
"""Turn character images (for example from ComfyUI) into CoKo widget sprites.

    python tools/make_sprites.py happy.png sleepy.png excited.png ...
    python tools/make_sprites.py --dir ~/Downloads/ComfyUI

Each file name (or the first word of it) must be a mood:
    happy focused sleepy tired worried panic excited giggle love surprised wave
Only "happy" is required. Missing moods fall back to the closest one.

For each image the script:
  1. removes the background, using `rembg` if it is installed
     (pip install rembg). Otherwise it flood-fills a plain light background
     in from the edges, so ask ComfyUI for a "plain white background",
  2. trims the empty space and centres the character on a square canvas,
     feet at the bottom,
  3. saves src/assets/koko/<mood>.png (512 px) and rewrites sprites.js.

Requires Pillow (pip install pillow).
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

MOODS = ["happy", "focused", "sleepy", "tired", "worried", "panic",
         "excited", "giggle", "love", "surprised", "wave"]
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "koko"
SIZE = 512


def mood_of(path: Path) -> str | None:
    stem = path.stem.lower().replace("-", "_").replace(" ", "_")
    for part in stem.split("_"):
        if part in MOODS:
            return part
    return None


def remove_bg_rembg(img: Image.Image) -> Image.Image | None:
    try:
        from rembg import remove  # type: ignore
    except ImportError:
        return None
    return remove(img)


def remove_bg_flood(img: Image.Image, tol: int = 38) -> Image.Image:
    """Make the background transparent, assuming a plain, roughly uniform one.

    Starts from every border pixel and spreads into neighbours whose colour is
    within `tol` of the background colour (taken from the median corner colour).
    Enclosed light areas inside the character, such as eye highlights, are kept.
    """
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))

    def close(c):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= tol * 3 and c[3] > 0

    mask = Image.new("L", (w, h), 255)
    m = mask.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not close(px[x, y]):
            continue
        m[x, y] = 0
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    # Soften the cut edge a little so it doesn't look jagged on dark desktops.
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(mask)
    return img


def fit(img: Image.Image) -> Image.Image:
    box = img.getchannel("A").point(lambda a: 255 if a > 12 else 0).getbbox()
    if box:
        img = img.crop(box)
    w, h = img.size
    scale = (SIZE * 0.96) / max(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(img, ((SIZE - img.width) // 2, SIZE - img.height), img)
    return canvas


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("images", nargs="*", type=Path)
    ap.add_argument("--dir", type=Path, help="take every image in this folder")
    ap.add_argument("--no-rembg", action="store_true", help="always use the plain-background flood fill")
    ap.add_argument("--keep-bg", action="store_true", help="image already has transparency; skip removal")
    args = ap.parse_args()

    files = list(args.images)
    if args.dir:
        files += sorted(p for p in args.dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    if not files:
        ap.print_help()
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    sprites: dict[str, str] = {}
    manifest = OUT / "sprites.js"
    if manifest.exists():  # keep moods made earlier
        txt = manifest.read_text()
        start = txt.find("window.KOKO_SPRITES =")
        if start != -1:
            try:
                sprites = json.loads(txt[start + len("window.KOKO_SPRITES ="):].strip().rstrip(";"))
            except json.JSONDecodeError:
                sprites = {}

    for f in files:
        mood = mood_of(f)
        if not mood:
            print(f"skip {f.name}: name it after a mood ({', '.join(MOODS)})", file=sys.stderr)
            continue
        img = Image.open(f).convert("RGBA")
        if not args.keep_bg:
            cut = None if args.no_rembg else remove_bg_rembg(img)
            img = cut if cut is not None else remove_bg_flood(img)
        out = OUT / f"{mood}.png"
        fit(img).save(out, optimize=True)
        sprites[mood] = f"assets/koko/{mood}.png"
        print(f"{f.name} -> {out.relative_to(ROOT)}")

    if "happy" not in sprites:
        print("warning: no 'happy' sprite yet; it is the default pose", file=sys.stderr)
    manifest.write_text(
        "// Generated by tools/make_sprites.py. Delete the entries to go back to the vector mascot.\n"
        "window.KOKO_SPRITES = " + json.dumps(sprites, indent=2) + ";\n"
    )
    print(f"wrote {manifest.relative_to(ROOT)} ({len(sprites)} moods)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
