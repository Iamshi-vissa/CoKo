// Background tracker. Every 5 s it samples the focused app, idle time and
// (every 30 s) the battery. It records sessions from OS events (login,
// lock/unlock, sleep/wake, shutdown), sends notifications and broadcasts a
// live status so the mascot reacts.
import { powerMonitor, Notification } from 'electron';
import si from 'systeminformation';
import { dayKey } from './store.js';
import { getProfile, classify } from './profiles.js';
import { getActiveWindow, stopActiveWindow } from './activeWindow.js';

const TICK = 5;

export const fmtDur = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export class Tracker {
  constructor(store, { broadcast, icon }) {
    this.store = store;
    this.broadcast = broadcast;
    this.icon = icon;
    this.session = null;
    this.streak = 0;
    this.away = false;
    this.awaySince = 0;
    this.battery = null;
    this.warned = { low: false, critical: false, full: false };
    this.goalDay = null;
    this.lastWorklog = Date.now();
    this.tick = 0;
    this.status = {};
  }

  // ---------------------------------------------------------------- sessions
  startSession(reason) {
    const now = Date.now();
    const sessions = this.store.data.sessions;
    for (const s of sessions) if (!s.end) { s.end = s.last; s.endReason = 'shutdown/crash'; }
    this.session = { start: now, last: now, end: null, startReason: reason, endReason: null };
    sessions.push(this.session);
    if (sessions.length > 2000) sessions.splice(0, sessions.length - 2000);
    this.store.save();
  }

  endSession(reason) {
    if (!this.session || this.session.end) return;
    this.session.last = this.session.end = Date.now();
    this.session.endReason = reason;
    this.store.save(true);
  }

  notify(title, body) {
    try { new Notification({ title, body, icon: this.icon, silent: false }).show(); } catch { /* unsupported */ }
  }

  event(kind, message) { this.broadcast('coko:event', { kind, message }); }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this.startSession('login');
    powerMonitor.on('lock-screen', () => { this.endSession('locked'); this.event('away', 'Screen locked. I\'ll wait here~'); });
    powerMonitor.on('unlock-screen', () => { this.startSession('unlocked'); this.event('welcome_back', 'Welcome back! I missed you~'); });
    powerMonitor.on('suspend', () => this.endSession('sleep'));
    powerMonitor.on('resume', () => { this.startSession('wake'); this.event('welcome_back', 'Good to see you again!'); });
    powerMonitor.on('shutdown', () => this.endSession('shutdown'));
    this.loop = setInterval(() => this.step().catch(() => {}), TICK * 1000);
    this.readBattery();
  }

  stop(reason = 'quit') {
    clearInterval(this.loop);
    stopActiveWindow();
    this.endSession(reason);
  }

  async readBattery() {
    try {
      const b = await si.battery();
      if (!b.hasBattery) { this.battery = null; return; }
      const prev = this.battery;
      this.battery = { percent: b.percent, charging: !!(b.isCharging || b.acConnected) };
      this.onBattery(prev);
    } catch { this.battery = null; }
  }

  onBattery(prev) {
    const s = this.store.settings;
    const { percent: pct, charging } = this.battery;
    if (prev && charging !== prev.charging) {
      this.event(charging ? 'plugged' : 'unplugged', charging ? 'Yum, power! Thank you~' : "Unplugged! I'll watch the battery.");
    }
    if (charging) {
      this.warned.low = this.warned.critical = false;
      if (pct >= 99 && !this.warned.full && s.notifyBattery) {
        this.warned.full = true;
        this.notify('Battery full', 'Fully charged. You can unplug now.');
        this.event('battery_full', 'Battery is full! You can unplug me~');
      }
    } else {
      this.warned.full = false;
      if (pct <= 10 && !this.warned.critical && s.notifyBattery) {
        this.warned.critical = true;
        this.notify('Battery critical', `Only ${pct}% left. Plug in now!`);
        this.event('battery_critical', `Battery ${pct}%! Please plug me in!!`);
      } else if (pct <= s.lowBattery && !this.warned.low && s.notifyBattery) {
        this.warned.low = true;
        this.notify('Low battery', `Battery at ${pct}%. Time to find a charger.`);
        this.event('battery_low', `Battery at ${pct}%... find a charger?`);
      }
    }
    if (this.tick % 60 === 0) {
      this.store.data.battery.push({ t: Date.now(), p: pct, c: charging });
      this.store.prune();
    }
  }

  // ---------------------------------------------------------------- one sample
  async step() {
    this.tick++;
    const s = this.store.settings;
    const profile = getProfile(s.profile);
    const goalSecs = (s.goalHours ?? profile.goalHours) * 3600;
    const breakSecs = (s.breakMinutes ?? profile.breakMinutes) * 60;
    const idle = powerMonitor.getSystemIdleTime();
    const away = idle >= profile.idleSeconds;
    const day = this.store.day();
    const now = Date.now();
    const hour = new Date().getHours();

    if (!this.session || this.session.end) this.startSession('active');
    this.session.last = now;

    let win = { app: '', title: '' }, category = 'away';
    if (away) {
      day.idle += TICK;
      if (!this.away) { this.awaySince = now - idle * 1000; this.event('away', 'Zzz... wake me when you\'re back~'); }
      this.streak = 0;
    } else {
      win = await getActiveWindow();
      category = classify(profile, win.app, win.title);
      day.active += TICK;
      day.hours[hour] += TICK;
      if (category === 'focus') day.focus += TICK;
      if (category === 'distraction') day.distraction += TICK;
      day.first ??= now;
      day.last = now;
      const a = (day.apps[win.app] ||= { secs: 0, cat: category });
      a.secs += TICK; a.cat = category;
      if (this.away) this.event('welcome_back', `Welcome back! You were away ${fmtDur((now - this.awaySince) / 1000)}.`);
      this.streak += TICK;
      if (breakSecs > 0 && this.streak >= breakSecs) {
        this.streak = 0;
        if (s.notifyBreaks) {
          const msg = `You've been going for ${fmtDur(breakSecs)}. Stretch, drink water and rest your eyes!`;
          this.notify(`${s.mascotName}: break time!`, msg);
          this.event('break', msg);
        }
      }
    }
    this.away = away;

    // Daily goal and hourly work log.
    const today = dayKey();
    if (this.goalDay !== today && goalSecs > 0 && day.active >= goalSecs) {
      this.goalDay = today;
      const msg = `Daily goal of ${fmtDur(goalSecs)} reached! You're amazing!`;
      this.notify('Goal complete! 🎉', msg);
      this.event('goal', msg);
    }
    if (now - this.lastWorklog >= 3600e3) {
      this.lastWorklog = now;
      if (s.notifyWorklog && day.active > 0) {
        const top = Object.entries(day.apps).sort((a, b) => b[1].secs - a[1].secs)[0];
        const msg = `Today: ${fmtDur(day.active)} active, ${fmtDur(day.focus)} focused${top ? `, mostly ${top[0]}` : ''}.`;
        this.notify('Hourly work log', msg);
        this.event('worklog', msg);
      }
    }

    if (this.tick % 6 === 0) await this.readBattery();
    this.store.save();

    this.status = {
      state: away ? 'away' : 'active',
      app: win.app, title: win.title, category,
      idle, streak: this.streak,
      battery: this.battery,
      todayActive: day.active, todayFocus: day.focus,
      goalSecs, breakSecs,
      sessionStart: this.session.start,
    };
    this.broadcast('coko:status', this.status);
  }
}
