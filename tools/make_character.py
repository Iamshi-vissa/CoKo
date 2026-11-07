#!/usr/bin/env python3
"""Turn ComfyUI output (images and/or image-to-video clips) into CoKo's animated buddy.

    python3 tools/make_character.py idle.mp4 wave.mp4 sleepy.mp4 happy.png ...
    python3 tools/make_character.py --dir ~/Downloads/ComfyUI

Name each file after a mood. The mood can be anywhere in the name, as in
"coko_sleepy_00001.mp4":
    idle happy focused sleepy tired worried panic excited giggle love surprised wave
"idle" (or "happy") is the default pose. Missing moods fall back to the closest one.

For each file:
  * Videos are resampled to 24 fps and 512 px. The background is removed
    frame by frame, the end is crossfaded into the start for a seamless loop,
    and the result is encoded as a transparent VP9 WebM.
  * Stills have their background removed. When any video exists they are
    stored as short WebM loops (CoKo adds breathing and swaying itself);
    otherwise they are stored as PNGs.
Output goes to src/renderer/character/ along with manifest.json.

Background removal uses `rembg` when installed (pip install rembg[cpu]) and
handles any background. Otherwise it flood-fills a plain background in from the
edges, so prompt ComfyUI for a "solid flat pure green background" (chroma key).
Needs: ffmpeg on PATH and Pillow; numpy + scipy make it much faster
(pip install pillow numpy scipy).
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

MOODS = ["idle", "happy", "focused", "sleepy", "tired", "worried", "panic",
         "excited", "giggle", "love", "surprised", "wave"]
VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv", ".gif"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "renderer" / "character"
SIZE = 512
FPS = 24


def mood_of(p: Path) -> str | None:
    parts = p.stem.lower().replace("-", "_").replace(" ", "_").split("_")
    return next((m for m in parts if m in MOODS), None)


# ---------------------------------------------------------------- background removal
_rembg = None


def remove_bg(img: Image.Image, use_rembg: bool, tol: int) -> Image.Image:
    global _rembg
    if use_rembg:
        if _rembg is None:
            try:
                from rembg import new_session, remove  # type: ignore
                sess = new_session("isnet-anime")  # model tuned for anime art
                _rembg = lambda im: remove(im, session=sess)
            except Exception:
                _rembg = False
        if _rembg:
            return _rembg(img)
    return flood_cut(img, tol)


def flood_cut(img: Image.Image, tol: int) -> Image.Image:
    try:
        return flood_cut_fast(img, tol)
    except ImportError:
        return flood_cut_slow(img, tol)


def flood_cut_fast(img: Image.Image, tol: int) -> Image.Image:
    """numpy/scipy version of flood_cut_slow: same result, about 100x faster."""
    import numpy as np
    from scipy import ndimage

    img = img.convert("RGBA")
    a = np.asarray(img).astype(np.int16)
    h, w = a.shape[:2]
    corners = np.array([a[0, 0, :3], a[0, w - 1, :3], a[h - 1, 0, :3], a[h - 1, w - 1, :3]])
    bg = np.sort(corners, axis=0)[1]
    close = np.abs(a[:, :, :3] - bg).sum(axis=2) <= tol * 3
    labels, _ = ndimage.label(close)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge = edge[edge > 0]
    background = np.isin(labels, edge)
    mask = Image.fromarray(np.where(background, 0, 255).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))
    return img


def flood_cut_slow(img: Image.Image, tol: int) -> Image.Image:
    """Clear a plain background by flood-filling from the borders.
    Light areas fully enclosed by the character (eye highlights, white clothes)
    are kept because the fill can't reach them."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
    lim = tol * 3

    mask = Image.new("L", (w, h), 255)
    m = mask.load()
    seen = bytearray(w * h)
    q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        c = px[x, y]
        if abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > lim:
            continue
        m[x, y] = 0
        if x: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(ImageChops.multiply(img.getchannel("A"), mask))
    return img


def fit_box(frames: list[Image.Image]) -> tuple[int, int, int, int] | None:
    """One crop box for all frames, so the character doesn't jump between frames."""
    box = None
    for f in frames:
        b = f.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def place(img: Image.Image, box) -> Image.Image:
    if box:
        img = img.crop(box)
    w, h = img.size
    s = (SIZE * 0.96) / max(w, h)
    img = img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(img, ((SIZE - img.width) // 2, SIZE - img.height), img)
    return canvas


# ---------------------------------------------------------------- encoding
def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def encode_webm(frames_dir: Path, out: Path) -> None:
    ffmpeg("-framerate", str(FPS), "-i", str(frames_dir / "f_%04d.png"),
           "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30",
           "-row-mt", "1", "-auto-alt-ref", "0", "-an", str(out))


def process_video(src: Path, out: Path, args) -> None:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        raw = td / "raw"; raw.mkdir()
        ffmpeg("-i", str(src), "-vf", f"fps={FPS},scale={SIZE * 2}:-2:flags=lanczos", str(raw / "r_%04d.png"))
        files = sorted(raw.glob("r_*.png"))
        if args.max_seconds:
            files = files[: int(args.max_seconds * FPS)]
        if not files:
            raise RuntimeError("no frames decoded")
        cut = [remove_bg(Image.open(f).convert("RGBA"), not args.no_rembg, args.tolerance) for f in files]
        box = fit_box(cut)
        frames = [place(f, box) for f in cut]
        # Seamless loop: blend the last `n` frames into the first ones.
        n = min(len(frames) // 4, int(args.loop_blend * FPS))
        if n > 1:
            head, body, tail = frames[:n], frames[n:-n] if len(frames) > 2 * n else frames[n:], frames[-n:]
            mixed = [Image.blend(tail[i], head[i], (i + 1) / (n + 1)) for i in range(n)]
            frames = body + mixed
        fd = td / "f"; fd.mkdir()
        for i, f in enumerate(frames):
            f.save(fd / f"f_{i:04d}.png")
        encode_webm(fd, out)
        print(f"  {len(frames)} frames, {len(frames) / FPS:.1f}s loop")


def process_still(src: Path, out: Path, as_video: bool, args) -> None:
    img = remove_bg(Image.open(src).convert("RGBA"), not args.no_rembg, args.tolerance)
    img = place(img, fit_box([img]))
    if not as_video:
        img.save(out, optimize=True)
        return
    with tempfile.TemporaryDirectory() as td:
        fd = Path(td)
        for i in range(FPS * 2):
            img.save(fd / f"f_{i:04d}.png") if i == 0 else shutil.copy(fd / "f_0000.png", fd / f"f_{i:04d}.png")
        encode_webm(fd, out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", type=Path)
    ap.add_argument("--dir", type=Path, help="use every image/video in this folder")
    ap.add_argument("--no-rembg", action="store_true", help="always use the plain-background flood fill")
    ap.add_argument("--tolerance", type=int, default=16, help="flood-fill colour tolerance; raise it for noisy backgrounds (default 16)")
    ap.add_argument("--loop-blend", type=float, default=0.5, help="seconds crossfaded to make loops seamless")
    ap.add_argument("--max-seconds", type=float, default=6, help="trim clips to this length (0 = keep all)")
    ap.add_argument("--reset", action="store_true", help="remove existing character files first")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        print("ffmpeg is required: https://ffmpeg.org/download.html", file=sys.stderr)
        return 1
    files = list(args.files)
    if args.dir:
        files += sorted(p for p in args.dir.iterdir() if p.suffix.lower() in VIDEO_EXT | IMAGE_EXT)
    jobs = []
    for f in files:
        m = mood_of(f)
        if not m:
            print(f"skip {f.name}: put a mood in the file name ({', '.join(MOODS)})", file=sys.stderr)
        else:
            jobs.append((m, f))
    if not jobs:
        ap.print_help()
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    manifest = {"type": "image", "moods": {}, "still": []}
    if manifest_path.exists() and not args.reset:
        manifest.update(json.loads(manifest_path.read_text()))
    if args.reset:
        for p in OUT.iterdir():
            if p.suffix in {".webm", ".png"} or p.name == "manifest.json":
                p.unlink()
        manifest = {"type": "image", "moods": {}, "still": []}

    has_video = manifest["type"] == "video" or any(f.suffix.lower() in VIDEO_EXT for _, f in jobs)
    if has_video and manifest["type"] != "video":
        # Upgrade earlier PNG moods to WebM so one player handles everything.
        for m, name in list(manifest["moods"].items()):
            if name.endswith(".png") and (OUT / name).exists():
                process_still(OUT / name, OUT / f"{m}.webm", True, args)
                (OUT / name).unlink()
                manifest["moods"][m] = f"{m}.webm"
                manifest["still"] = sorted(set(manifest.get("still", [])) | {m})
        manifest["type"] = "video"

    for mood, f in jobs:
        print(f"{f.name} -> {mood}")
        if f.suffix.lower() in VIDEO_EXT:
            out = OUT / f"{mood}.webm"
            process_video(f, out, args)
            manifest["still"] = [m for m in manifest.get("still", []) if m != mood]
        else:
            out = OUT / (f"{mood}.webm" if has_video else f"{mood}.png")
            process_still(f, out, has_video, args)
            manifest["still"] = sorted(set(manifest.get("still", [])) | {mood})
        manifest["moods"][mood] = out.name

    if not {"idle", "happy"} & manifest["moods"].keys():
        print("note: add an 'idle' or 'happy' file; it is the default pose", file=sys.stderr)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {manifest_path.relative_to(ROOT)}: {manifest['type']}, moods {sorted(manifest['moods'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
