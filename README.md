# CoKo: your animated anime desk buddy

CoKo puts a small animated anime girl on your desktop, about the size of 2×2 desktop icons. She quietly tracks your day. Click her and a status-screen dashboard pops up beside her with your logs.

Built with **Electron**, so transparent animated video loops play smoothly on Windows, macOS and Linux.

## What she does
- **Lives on your desktop:** a transparent, always-on-top buddy you can drag anywhere. She remembers the spot.
- **Click her** to pop the dashboard open beside her. Click anywhere else, or press Esc, to close it.
- **Right-click her** for a quick summary of today.
- **Reacts to you:**

  | What's happening | How she reacts |
  |---|---|
  | Working in a focus app | Focused |
  | Away from the keyboard | Falls asleep |
  | Close to break time | Gets tired |
  | Low battery | Worried |
  | Critical battery | Panics |
  | Charger plugged in | Happy |
  | Goal reached | Excited |
  | You come back | Waves |
  | You open YouTube in the middle of work | Gently nudges you |

## What it tracks
| | How |
|---|---|
| Log-ins | Every login, screen unlock and wake from sleep starts a session. Lock, sleep, shutdown or quitting ends it, using the OS's own power events. |
| Active apps | Every 5 s it records the focused app. Each app is tagged focus, distraction or neutral based on your type. |
| Idle time | OS input-idle time. Past your type's threshold, time counts as away. |
| Battery | Checked every 30 s, with a 7-day history. |
| Quests | Tasks with checkboxes, notes and work logs, each with an optional mood. |

**Notifications:** break reminders, an hourly work-log summary, low, critical and full battery alerts, and a message when you reach your daily goal.

All data stays on your computer in `coko-data.json`. Use **Open data folder** in the tray menu to find it.

## The dashboard
It looks like a game character's status screen:
- **Header:** her portrait, your **level** (one level per day you hit your goal) and a gold **EXP bar** for today's goal.
- **Today:** active time, focus and away time, a battery bar, an hour-by-hour activity strip, your log-in history and where your time went.
- **Quests:** your journal.
- **Week:** 7-day bars against your goal line.
- **Setup:** the 5 types, your name, the buddy's name, goal, break interval, battery warning, buddy size (S/M/L), notifications and showing or hiding the buddy.

## The 5 types
| Type | Goal | Break every | Counts as focus (examples) |
|---|---|---|---|
| 📚 Student | 4 h | 45 min | Notion, PDF readers, Anki, Classroom |
| 💻 Developer | 6 h | 60 min | VS Code, JetBrains, terminals, GitHub |
| 🎨 Freelancer | 5 h | 50 min | Figma, Adobe, DaVinci, Upwork |
| 💼 Office | 8 h | 60 min | Outlook, Teams, Excel, Jira |
| 🌸 Personal | 3 h | 40 min | Notes, Kindle, Duolingo |

Each type also sets the colour theme, the journal prompts and what she says. To change or add types, edit `src/main/profiles.js`.

## Run it
You need [Node.js 18+](https://nodejs.org).
```bash
npm install
npm start          # run CoKo
npm run dist       # build an installer: .exe (Windows), .dmg (macOS), .AppImage/.deb (Linux)
```
An installed build starts automatically when you log in, which is how log-ins get tracked.

---

## Give her a real animated look with ComfyUI
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

---

## Notes
- **Active-app detection** uses built-in OS tools, with nothing to compile: PowerShell on Windows, `lsappinfo` on macOS and `xprop` on Linux. On Linux it needs X11; Wayland doesn't expose other apps' windows.
- On Linux, the transparent buddy needs a compositing desktop, which GNOME, KDE and Cinnamon all are.
- Run with `COKO_DEBUG=1 npm start` to see renderer logs in the terminal.

## Project layout
```
src/main/        main.js (windows, tray, IPC), tracker.js, activeWindow.js, store.js, profiles.js, preload.cjs
src/renderer/    widget.* (desktop buddy), dashboard.* (status-screen popup)
  shared/        character.js (video/image/built-in player + motion), base.css, fonts
  character/     your converted ComfyUI loops + manifest.json
tools/           make_character.py
```
Fonts: M PLUS Rounded 1c and Dela Gothic One (SIL Open Font License), bundled in `src/renderer/shared/fonts`.
