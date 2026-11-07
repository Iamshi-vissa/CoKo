// Tiny JSON store in the app's user-data folder. Everything stays local.
// Writes are batched and atomic (write temp file, then rename).
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_SETTINGS = {
  profile: 'developer',
  mascotName: 'Koko',
  userName: '',
  goalHours: null,        // null = use the profile default
  breakMinutes: null,
  lowBattery: 20,
  notifyBattery: true,
  notifyBreaks: true,
  notifyWorklog: true,
  showWidget: true,
  widgetSize: 'medium',    // small | medium | large
  widgetX: null,
  widgetY: null,
  onboarded: false,
};

const EMPTY = () => ({ version: 2, settings: { ...DEFAULT_SETTINGS }, sessions: [], days: {}, battery: [], journal: [] });

export const dayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export class Store {
  constructor(dir) {
    this.file = path.join(dir, 'coko-data.json');
    fs.mkdirSync(dir, { recursive: true });
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { ...EMPTY(), ...raw, settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) } };
    } catch {
      this.data = EMPTY();
    }
    this.timer = null;
  }

  get settings() { return this.data.settings; }

  setSettings(patch) {
    Object.assign(this.data.settings, patch);
    this.save();
    return this.data.settings;
  }

  day(key = dayKey()) {
    return (this.data.days[key] ||= { active: 0, idle: 0, focus: 0, distraction: 0, first: null, last: null, apps: {}, hours: Array(24).fill(0) });
  }

  save(now = false) {
    clearTimeout(this.timer);
    const write = () => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    };
    if (now) write();
    else this.timer = setTimeout(write, 2000);
  }

  /** Keep the file small: drop battery samples older than 7 days. */
  prune() {
    const cutoff = Date.now() - 7 * 864e5;
    this.data.battery = this.data.battery.filter((b) => b.t >= cutoff);
  }
}
