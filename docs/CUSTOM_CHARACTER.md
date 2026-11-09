# Custom character with ComfyUI
CoKo ships with a simple built-in buddy. Here's how to swap in detailed anime art that really moves.

**1. Make the character (text to image).** In Comfy Cloud, run the **Z-Image Turbo** template, which is free. Ask for one full-body character on a green background, for example:

> High quality anime illustration of an original cute chibi girl mascot, full body, standing centered, facing the viewer, small friendly smile. Big amber eyes, mint-teal twin-tails with star clips, navy headphones with pink cat ears, oversized pastel periwinkle hoodie, white sneakers. Polished gacha-game sticker style, clean line art, soft cel shading. **Solid flat pure green background**, no shadow, no text.

Save the one you like as `idle.png`.

**2. Animate it (image to video).** Run the **Wan 2.2 14B Image to Video** template, also free, with that image as input, once per mood. Keep "static camera, green background stays the same" in every prompt:

| File name | Motion prompt |
|---|---|
| `idle.mp4` | gentle breathing, twin-tails swaying softly, blinks, small smile, static camera |
| `wave.mp4` | waves hello with one hand and smiles brightly, static camera |
| `focused.mp4` | nods slightly while concentrating, determined look, static camera |
| `sleepy.mp4` | eyes close, head slowly droops, tiny yawn, static camera |
| `worried.mp4` | nervous look, fidgets with her hoodie strings, static camera |
| `excited.mp4` | jumps happily with both arms up, sparkly eyes, static camera |

Only `idle` is required. Any missing mood uses the closest one.

**3. Convert them.**
```bash
pip install pillow numpy scipy            # optional: pip install "rembg[cpu]" for any background
python3 tools/make_character.py --dir ~/Downloads/ComfyUI
npm start
```
The script removes the green background frame by frame, crossfades the end of each clip into its start for a seamless loop, and saves transparent WebM loops plus `manifest.json` into `src/renderer/character/`. You can mix clips and still images; stills get CoKo's own breathing and sway animation. Use `--reset` to start over. If you leave out the green background, install `rembg`, which uses an anime-tuned model to cut out any background.

Back to the [README](../README.md).
