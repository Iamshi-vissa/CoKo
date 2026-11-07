// CoKo main process: windows, tray, IPC, autostart.
import { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Store, dayKey } from './store.js';
import { Tracker } from './tracker.js';
import { PROFILES, getProfile } from './profiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(ROOT, 'build', 'icon.png');
const PRELOAD = path.join(__dirname, 'preload.cjs');

const WIDGET_SIZES = { small: 150, medium: 190, large: 250 };
const BUBBLE_SPACE = 64;
const DASH = { width: 430, height: 640 };

if (!app.requestSingleInstanceLock()) app.quit();
// Transparent windows on Linux need this to avoid a black background on some GPUs.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');

let store, tracker, widget, dash, tray;
let lastDashHide = 0;

// Set COKO_DEBUG=1 to print renderer console output to the terminal.
const debugConsole = (w, name) => {
  if (process.env.COKO_DEBUG) w.webContents.on('console-message', (e) => console.log(`[${name}] ${e.message ?? ''}`));
};

const broadcast = (channel, payload) => {
  for (const w of [widget, dash]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
};

// ------------------------------------------------------------------ character
function characterManifest() {
  const file = path.join(RENDERER, 'character', 'manifest.json');
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (m && m.moods && Object.keys(m.moods).length) return m;
  } catch { /* none yet */ }
  return { type: 'builtin', moods: {} };
}

// ------------------------------------------------------------------ windows
function widgetBounds() {
  const size = WIDGET_SIZES[store.settings.widgetSize] || WIDGET_SIZES.medium;
  const w = size, h = size + BUBBLE_SPACE;
  let { widgetX: x, widgetY: y } = store.settings;
  const onScreen = x != null && screen.getAllDisplays().some(({ workArea: a }) =>
    x + w / 2 >= a.x && x + w / 2 <= a.x + a.width && y + h / 2 >= a.y && y + h / 2 <= a.y + a.height);
  if (!onScreen) {
    const a = screen.getPrimaryDisplay().workArea;
    x = a.x + a.width - w - 24;
    y = a.y + a.height - h - 16;
  }
  return { x: Math.round(x), y: Math.round(y), width: w, height: h };
}

function createWidget() {
  widget = new BrowserWindow({
    ...widgetBounds(),
    frame: false, transparent: true, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: true,
    fullscreenable: false, maximizable: false, minimizable: false,
    backgroundColor: '#00000000', show: false, title: 'CoKo',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  widget.setAlwaysOnTop(true, 'floating');
  widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  debugConsole(widget, 'widget');
  widget.loadFile(path.join(RENDERER, 'widget.html'));
  widget.once('ready-to-show', () => { if (store.settings.showWidget) widget.showInactive(); });
  widget.on('moved', saveWidgetPos);
  widget.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); widget.hide(); } });
}

function saveWidgetPos() {
  const [x, y] = widget.getPosition();
  store.setSettings({ widgetX: x, widgetY: y });
}

function createDashboard() {
  dash = new BrowserWindow({
    width: DASH.width, height: DASH.height,
    frame: false, transparent: true, resizable: false, skipTaskbar: true, show: false,
    alwaysOnTop: true, fullscreenable: false, maximizable: false, minimizable: false,
    backgroundColor: '#00000000', hasShadow: true, title: 'CoKo',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
  });
  debugConsole(dash, 'dash');
  dash.loadFile(path.join(RENDERER, 'dashboard.html'));
  // Behaves like a popup: clicking elsewhere hides it.
  dash.on('blur', () => {
    if (!store.settings.onboarded) return;
    dash.hide();
    lastDashHide = Date.now();
  });
  dash.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); dash.hide(); } });
}

function placeDashboard() {
  const wb = widget.isVisible() ? widget.getBounds() : null;
  const display = wb ? screen.getDisplayMatching(wb) : screen.getPrimaryDisplay();
  const a = display.workArea, gap = 10;
  let x, y;
  if (wb) {
    x = wb.x - DASH.width - gap >= a.x ? wb.x - DASH.width - gap : wb.x + wb.width + gap;
    y = wb.y + wb.height - DASH.height;
  } else {
    x = a.x + a.width - DASH.width - 24;
    y = a.y + a.height - DASH.height - 24;
  }
  x = Math.min(Math.max(x, a.x + 8), a.x + a.width - DASH.width - 8);
  y = Math.min(Math.max(y, a.y + 8), a.y + a.height - DASH.height - 8);
  dash.setBounds({ x: Math.round(x), y: Math.round(y), width: DASH.width, height: DASH.height });
}

function showDashboard(tab) {
  placeDashboard();
  dash.show();
  dash.focus();
  dash.webContents.send('coko:dashboard-shown', { tab });
}

function toggleDashboard() {
  if (dash.isVisible()) { dash.hide(); lastDashHide = Date.now(); return; }
  // The click on the widget blurred (and hid) the popup a moment ago: keep it closed.
  if (Date.now() - lastDashHide < 350) return;
  showDashboard();
}

function setWidgetVisible(v) {
  store.setSettings({ showWidget: v });
  if (v) widget.showInactive(); else widget.hide();
  buildTrayMenu();
}

// ------------------------------------------------------------------ tray
function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open dashboard', click: () => showDashboard() },
    { label: 'Show desk buddy', type: 'checkbox', checked: store.settings.showWidget, click: (i) => setWidgetVisible(i.checked) },
    { type: 'separator' },
    { label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) },
    { label: 'Quit CoKo', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('CoKo is tracking your day');
  tray.on('click', () => toggleDashboard());
  buildTrayMenu();
}

// ------------------------------------------------------------------ autostart
function enableAutostart() {
  if (!app.isPackaged) return; // don't register a dev build
  if (process.platform === 'linux') {
    const dir = path.join(os.homedir(), '.config', 'autostart');
    fs.mkdirSync(dir, { recursive: true });
    const exec = process.env.APPIMAGE || process.execPath;
    fs.writeFileSync(path.join(dir, 'coko.desktop'),
      `[Desktop Entry]\nType=Application\nName=CoKo\nExec="${exec}" --hidden\nX-GNOME-Autostart-enabled=true\n`);
  } else {
    app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
  }
}

// ------------------------------------------------------------------ reports
function daySummary(key = dayKey()) {
  const d = store.day(key);
  const start = new Date(`${key}T00:00:00`).getTime(), end = start + 864e5;
  const sessions = store.data.sessions
    .filter((s) => s.start < end && (s.end ?? s.last) >= start)
    .map((s) => ({ ...s, live: s === tracker.session && !s.end }));
  const apps = Object.entries(d.apps).map(([app, v]) => ({ app, secs: v.secs, cat: v.cat }))
    .sort((a, b) => b.secs - a.secs).slice(0, 8);
  const battery = store.data.battery.filter((b) => b.t >= start && b.t < end);
  const goal = (store.settings.goalHours ?? getProfile(store.settings.profile).goalHours) * 3600;
  const level = 1 + Object.values(store.data.days).filter((x) => x.active >= goal).length;
  return { level, date: key, active: d.active, idle: d.idle, focus: d.focus, distraction: d.distraction, first: d.first, last: d.last, hours: d.hours, apps, sessions, battery };
}

function week() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 864e5));
    const d = store.data.days[key];
    out.push({ date: key, active: d?.active || 0, focus: d?.focus || 0 });
  }
  return out;
}

// ------------------------------------------------------------------ IPC
function registerIpc() {
  ipcMain.handle('coko:bootstrap', () => ({
    settings: store.settings, profiles: PROFILES, status: tracker.status,
    character: characterManifest(), platform: process.platform,
  }));
  ipcMain.handle('coko:summary', (_e, key) => daySummary(key));
  ipcMain.handle('coko:week', () => week());
  ipcMain.handle('coko:settings', (_e, patch) => {
    const before = { ...store.settings };
    const s = store.setSettings(patch);
    if ('showWidget' in patch && patch.showWidget !== before.showWidget) setWidgetVisible(patch.showWidget);
    if ('widgetSize' in patch && patch.widgetSize !== before.widgetSize) {
      const b = widget.getBounds(), nb = widgetBounds();
      // Keep the bottom-right corner anchored when resizing.
      widget.setBounds({ x: b.x + b.width - nb.width, y: b.y + b.height - nb.height, width: nb.width, height: nb.height });
    }
    broadcast('coko:settings', s);
    return s;
  });
  ipcMain.handle('coko:journal:list', (_e, key = dayKey()) => store.data.journal.filter((j) => j.date === key).reverse());
  ipcMain.handle('coko:journal:add', (_e, { kind, mood, text }) => {
    text = String(text || '').trim().slice(0, 500);
    if (!text) return null;
    const j = { id: Date.now(), date: dayKey(), t: Date.now(), kind, mood: mood || null, text, done: false };
    store.data.journal.push(j); store.save();
    return j;
  });
  ipcMain.handle('coko:journal:toggle', (_e, id) => {
    const j = store.data.journal.find((x) => x.id === id); if (j) { j.done = !j.done; store.save(); }
  });
  ipcMain.handle('coko:journal:delete', (_e, id) => {
    store.data.journal = store.data.journal.filter((x) => x.id !== id); store.save();
  });
  ipcMain.on('coko:dashboard:toggle', () => toggleDashboard());
  ipcMain.on('coko:dashboard:hide', () => { dash.hide(); lastDashHide = Date.now(); });
  ipcMain.on('coko:test-notification', () => tracker.notify(`Hi from ${store.settings.mascotName}!`, "Notifications work. I'll ping you about breaks, battery and work logs."));

  // Drag the widget: the renderer reports the grab offset; we follow the cursor.
  let dragTimer = null;
  ipcMain.on('coko:drag:start', (_e, { offsetX, offsetY }) => {
    clearInterval(dragTimer);
    const { width, height } = widget.getBounds();
    dragTimer = setInterval(() => {
      const p = screen.getCursorScreenPoint();
      widget.setBounds({ x: p.x - offsetX, y: p.y - offsetY, width, height });
    }, 8);
  });
  ipcMain.on('coko:drag:end', () => {
    clearInterval(dragTimer); dragTimer = null;
    // Snap back inside the work area if dropped half off-screen.
    const b = widget.getBounds(), a = screen.getDisplayMatching(b).workArea;
    const x = Math.min(Math.max(b.x, a.x), a.x + a.width - b.width);
    const y = Math.min(Math.max(b.y, a.y), a.y + a.height - b.height);
    widget.setBounds({ ...b, x, y });
    saveWidgetPos();
  });
}

// ------------------------------------------------------------------ app
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  store = new Store(app.getPath('userData'));
  tracker = new Tracker(store, { broadcast, icon: ICON });
  registerIpc();
  createWidget();
  createDashboard();
  createTray();
  enableAutostart();
  tracker.start();
  if (!store.settings.onboarded) dash.once('ready-to-show', () => showDashboard('setup'));
});

app.on('second-instance', () => showDashboard());
app.on('before-quit', () => { app.isQuitting = true; tracker?.stop('quit'); store?.save(true); });
app.on('window-all-closed', (e) => e.preventDefault());
