# CoKo — your desktop buddy & daily tracker

CoKo is a desktop assistant (Tauri 2 + Rust). It quietly tracks your day and has a mascot, **Koko**, who reacts to what you're doing.

## The desktop widget
CoKo lives on your desktop as a small floating mascot, about the size of 2×2 desktop icons. Her window is transparent, always on top and hidden from the taskbar.

- **Click** her to pop the log dashboard open beside her. Click again, or press **Esc**, to hide it.
- **Drag** her anywhere. CoKo remembers the spot.
- **Right-click** for a quick summary of today: active time, focus time and battery.
- **Hover** to see a goal ring with today's time and the battery level.
- Turn the widget on or off under **Settings → Show floating desktop widget**, or from the tray menu.

She animates smoothly: she breathes, bobs and sways, hops when excited, shakes when panicking, sways slowly when sleepy, and leans toward your cursor. Mood changes crossfade.

## Custom character art (ComfyUI)
The widget can use your own PNG art in place of the built-in vector mascot.

1. In ComfyUI (Comfy Cloud or local), generate one image per mood: **one character, full body, plain white background**. Use the same character description and seed each time and change only the expression. Moods: `happy` (required), `focused`, `sleepy`, `tired`, `worried`, `panic`, `excited`, `giggle`, `love`, `surprised`, `wave`.
2. Name the files after their moods (for example `happy.png`, `sleepy.png`) and run:
   ```bash
   pip install pillow          # optional: pip install rembg for better cut-outs
   python tools/make_sprites.py --dir path/to/your/images
   ```
   The script removes the background, trims and centres each image, saves it to `src/assets/koko/` and rewrites `src/assets/koko/sprites.js`. Any missing mood falls back to the closest one you have.
3. Restart CoKo. To go back to the vector mascot, reset `sprites.js` to `window.KOKO_SPRITES = {};`.

Example prompt (tested with Z-Image Turbo): *"Original chibi anime girl mascot, full body, standing, centered, facing viewer, mint-teal twin-tails, large amber eyes, navy headphones with pink cat ears, oversized periwinkle hoodie, white sneakers, clean anime cel shading, crisp outline, sticker style, solid flat pure white background."* Then add an expression, for example *"…sleeping with eyes closed and a tiny yawn"*.

## What it tracks
| | How |
|---|---|
| **Log-in sessions** | CoKo starts automatically when you log in, and each login is saved as a session. A heartbeat is written every 30 s. If the PC shuts down or logs out without warning, the session is closed at its last heartbeat the next time CoKo starts. |
| **Active apps** | Every 5 s CoKo reads the focused window (app + title) and adds up the time per app. Each app is labelled *focus*, *distraction* or *neutral* based on your profile. |
| **Idle / away time** | Uses OS input-idle time. Once you've been idle past the profile's threshold, the time counts as *away* and Koko falls asleep. |
| **Battery** | Checked every 30 s and logged every 5 min. |
| **Journal** | Notes, tasks (with checkboxes) and work-log entries, each with an optional mood. |

## Notifications
- Break reminders after N minutes of continuous activity
- An hourly work-log summary (active time, focus time, most-used app)
- Low battery (default 20%), critical battery (10%) and fully charged
- Daily goal reached

## The 5 types
| Type | Goal | Break every | Focus apps (examples) |
|---|---|---|---|
| Student | 4 h | 45 min | Notion, PDF readers, Anki, Classroom |
| Developer | 6 h | 60 min | VS Code, JetBrains, terminals, GitHub |
| Freelancer | 5 h | 50 min | Figma, Adobe, DaVinci, Upwork |
| Office | 8 h | 60 min | Outlook, Teams, Excel, Jira |
| Personal | 3 h | 40 min | Notes, Kindle, Duolingo |

Each type changes the accent colour, goals, app categories, journal prompts and what Koko says. To change or add a type, edit `src-tauri/src/profiles.rs`.

## Koko's moods
`happy`, `focused` (in a focus app), `sleepy` (away), `tired` (close to break time), `worried` (low battery), `panic` (critical battery), `excited` (goal reached or task done), `love` (charger plugged in), `surprised` (distraction app), `wave` and `giggle`. Her eyes follow your cursor, she blinks, and clicking her makes her talk. To restyle her, edit `src/mascot.js` (the SVG) and the `.koko` rules in `src/styles.css`.

## Run it
Prerequisites: Rust (stable), Node 18+, and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) for your OS.
On Linux you also need `libxss-dev libx11-dev libdbus-1-dev` for idle and active-window detection.

```bash
npm install
npm run dev      # run in development
npm run build    # make an installer (.msi/.exe, .dmg, .deb/.AppImage)
```
To preview just the UI, open `src/index.html` in a browser. It switches to demo data automatically.

## Notes
- Closing the dashboard just hides it, and CoKo keeps tracking from the widget and the tray. Use **Quit** in the tray menu to stop it.
- Transparent windows need a compositor on Linux, which most desktops have. macOS uses Tauri's `macos-private-api` for transparency, which is fine for direct downloads but not allowed in the Mac App Store.
- All data is stored locally in `coko.sqlite3` in the app-data folder (for example `%APPDATA%\com.coko.tracker` on Windows or `~/.local/share/com.coko.tracker` on Linux).
- macOS will ask for Accessibility / Screen Recording permission so CoKo can read window titles.
- Active-window detection on Linux works on X11. Wayland only exposes limited information.

## Project layout
```
src/                 frontend (no bundler)
  index.html, app.js   dashboard
  widget.html/js/css   floating desktop widget
  character.js         sprite renderer + smooth motion, shared mood logic
  mascot.js            built-in vector mascot (fallback)
  assets/koko/         sprite PNGs + sprites.js
tools/make_sprites.py  turns ComfyUI images into sprites
src-tauri/src/
  lib.rs             app setup, tray, commands
  tracker.rs         background sampler, notifications, live events
  db.rs              SQLite schema and queries
  profiles.rs        the 5 types
```
