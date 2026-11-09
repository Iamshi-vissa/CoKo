# <img src="docs/headers/h1-coko.svg" alt="COKO" height="60">

A small animated *desk buddy* that keeps track of your day and nudges you to take breaks.

## <img src="docs/headers/h2-about.svg" alt="ABOUT" height="38">

CoKo puts a little animated character on your desktop, about the size of four desktop icons. She
keeps an eye on how you spend your time: when you log in, which apps you use, when you step away
and how your battery is doing. Click her and a *dashboard* opens beside her, styled like a game
character's status screen.

Everything stays on your own computer in a single file, `coko-data.json`. Nothing is sent anywhere.

## <img src="docs/headers/h2-features.svg" alt="FEATURES" height="38">

- A transparent, always-on-top buddy you can drag anywhere; she remembers where you put her
- Click her for the *dashboard*, right-click for a quick summary of today
- She reacts to what you're doing:

  | What's happening | How she reacts |
  |---|---|
  | Working in a focus app | Focused |
  | Away from the keyboard | Falls asleep |
  | Close to break time | Gets tired |
  | Low battery | Worried |
  | Critical battery | Panics |
  | Charger plugged in | Happy |
  | Daily goal reached | Excited |
  | You come back | Waves |
  | YouTube in the middle of work | Gently nudges you |

- Notifications for breaks, an hourly work summary, battery alerts and reaching your goal
- *Quests*: a small to-do list with notes, work logs and an optional mood
- A level that goes up each day you hit your goal, plus a 7-day chart

## <img src="docs/headers/h2-how-it-works.svg" alt="HOW IT WORKS" height="38">

| What | How it's measured |
|---|---|
| Sessions | Logging in, unlocking and waking start a session; locking, sleep and shutdown end it |
| Active app | The focused app is checked every 5 seconds and tagged as focus, distraction or neutral |
| Idle time | Time with no keyboard or mouse input; past a threshold it counts as away |
| Battery | Checked every 30 seconds, with 7 days of history |

You pick one of five types when you start, and it sets your daily goal, break interval, which apps
count as *focus*, the colour theme and what she says:

| Type | Daily goal | Break every | Focus apps (examples) |
|---|---|---|---|
| Student | 4 h | 45 min | Notion, PDF readers, Anki, Classroom |
| Developer | 6 h | 60 min | VS Code, JetBrains, terminals, GitHub |
| Freelancer | 5 h | 50 min | Figma, Adobe, DaVinci, Upwork |
| Office | 8 h | 60 min | Outlook, Teams, Excel, Jira |
| Personal | 3 h | 40 min | Notes, Kindle, Duolingo |

To change or add types, edit `src/main/profiles.js`.

## <img src="docs/headers/h2-architecture.svg" alt="ARCHITECTURE" height="38">

```mermaid
flowchart LR
    OS[OS events: login, lock, sleep, idle] --> T[Tracker]
    AW[Active app check every 5 s] --> T
    BAT[Battery check every 30 s] --> T
    T --> DB[(coko-data.json)]
    T --> M[Mood and notifications]
    M --> W[Desktop buddy window]
    DB --> D[Dashboard window]
```

Everything runs in Electron's main process and is saved to one local file. The two windows only display it.

## <img src="docs/headers/h2-tech-stack.svg" alt="TECH STACK" height="38">

<p align="center">
  <img src="https://img.shields.io/badge/Electron-000000?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/JavaScript-000000?style=flat-square&logo=javascript&logoColor=white" alt="JavaScript">
  <img src="https://img.shields.io/badge/Node.js-000000?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/HTML5-000000?style=flat-square&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS-000000?style=flat-square&logo=css&logoColor=white" alt="CSS">
  <img src="https://img.shields.io/badge/Python-000000?style=flat-square&logo=python&logoColor=white" alt="Python">
</p>

| Layer | Technology |
|---|---|
| Desktop app | Electron |
| Code | JavaScript, HTML, CSS |
| System data | systeminformation, Electron powerMonitor |
| Character tool (optional) | Python, Pillow, NumPy |

## <img src="docs/headers/h2-getting-started.svg" alt="GETTING STARTED" height="38">

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
git clone https://github.com/Iamshi-vissa/CoKo.git
cd CoKo
npm install
npm start
```

To build an installer (`.exe` on Windows, `.dmg` on macOS, `.AppImage` or `.deb` on Linux):

```bash
npm run dist
```

An installed build starts when you log in, which is how log-ins get tracked.

Want a detailed animated character instead of the built-in one? See
[docs/CUSTOM_CHARACTER.md](docs/CUSTOM_CHARACTER.md).

## <img src="docs/headers/h2-things-to-know.svg" alt="THINGS TO KNOW" height="38">

- Active-app detection uses built-in OS tools, so there's nothing to compile: PowerShell on Windows,
  `lsappinfo` on macOS and `xprop` on Linux. On Linux it needs X11, because Wayland doesn't let apps
  see other windows.
- On Linux the transparent buddy needs a compositing desktop, which GNOME, KDE and Cinnamon are.
- Run `COKO_DEBUG=1 npm start` to see logs in the terminal.
- To find your data file, use **Open data folder** in the tray menu.

## <img src="docs/headers/h2-project-structure.svg" alt="PROJECT STRUCTURE" height="38">

```
src/main/        app windows, tray, tracking, storage and the five types
src/renderer/    the desktop buddy (widget.*) and the dashboard (dashboard.*)
  shared/        character player, base styles and fonts
  character/     your converted animation loops, if you add a custom character
tools/           make_character.py, for custom characters
docs/            custom character guide
```

## <img src="docs/headers/h2-status.svg" alt="STATUS" height="38">

Version 2 works on Windows, macOS and Linux (X11). There are no automated tests yet. Wayland support
for active-app detection is missing.

## <img src="docs/headers/h2-license.svg" alt="LICENSE" height="38">

MIT. See [LICENSE](LICENSE). The bundled fonts keep their own licenses in
`src/renderer/shared/fonts/`.
