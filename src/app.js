// CoKo frontend. Talks to the Rust backend through Tauri's global API.
// When opened in a plain browser (no Tauri), a small demo backend is used.
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ------------------------------------------------------------ backend bridge
  const T = window.__TAURI__;
  const api = T
    ? { invoke: T.core.invoke, listen: T.event.listen }
    : demoBackend();

  // ------------------------------------------------------------ state
  let settings, profiles, profile, status = {};
  let lastSummaryFetch = 0, distractionNudgeAt = 0, clicks = [];
  let journalKind = "note", journalMood = null;
  const koko = Character.create($("#mascot"), $("#bubble"));

  // ------------------------------------------------------------ helpers
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  };
  const clock = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (t) => { const el = $("#toast"); el.textContent = t; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2200); };
  const goalSecs = () => (settings.daily_goal_hours ?? profile.daily_goal_hours) * 3600;
  const userName = () => settings.user_name ? `, ${settings.user_name}` : "";

  function applyProfile() {
    profile = profiles.find((p) => p.id === settings.profile) || profiles[1];
    document.documentElement.style.setProperty("--accent", profile.accent);
    $("#profilePill").textContent = profile.name;
    $("#journalPrompt").textContent = pick(profile.journal_prompts);
    renderProfileGrid("#profileGrid", false);
  }

  // ------------------------------------------------------------ mood engine
  const deriveMood = (s) => Character.deriveMood(s, settings, profile);
  const REACT = Character.REACT;

  koko.el.addEventListener("mood", (e) => ($("#moodLabel").textContent = e.detail));

  koko.el.addEventListener("click", () => {
    const now = Date.now();
    clicks = clicks.filter((t) => now - t < 2000).concat(now);
    if (clicks.length >= 5) {
      koko.react("panic", 1800); koko.say("Hey! That tickles! >_<"); clicks = [];
    } else {
      koko.react(pick(["giggle", "wave", "excited"]), 1800);
      koko.say(pick(profile.cheers.concat([
        `You've been active for ${fmt(status.today_active_secs)} today!`,
        status.app ? `Ooh, working in ${status.app}?` : "What are we doing next?",
        pick(profile.journal_prompts),
      ])));
    }
  });

  function greet() {
    const h = new Date().getHours();
    const g = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 21 ? "Good evening" : "Late night session";
    koko.react("wave", 3200);
    koko.say(`${g}${userName()}! I'm ${settings.mascot_name}. Let's make today great~`, 6000);
  }

  // Random chatter so she feels alive.
  setInterval(() => {
    if (status.state === "away" || document.hidden) return;
    if (Math.random() < 0.5) koko.say(pick(profile.cheers));
  }, 4 * 60 * 1000);

  // ------------------------------------------------------------ live status
  function onStatus(s) {
    status = s;
    koko.setMood(deriveMood(s));
    $("#liveApp").textContent = s.state === "away" ? "Away" : (s.app || "—");
    $("#liveApp").title = s.title || "";
    $("#liveSession").textContent = fmt(Date.now() / 1000 - s.session_start);
    $("#liveStreak").textContent = fmt(s.continuous_active_secs);
    if (s.battery_percent != null) {
      const p = Math.round(s.battery_percent);
      $("#liveBattery").textContent = `${p}%${s.charging ? " ⚡" : ""}`;
      const f = $("#battFill");
      f.style.width = p + "%";
      f.style.background = s.charging ? "var(--good)" : p <= 10 ? "var(--bad)" : p <= settings.low_battery_percent ? "var(--warn)" : "var(--good)";
    } else {
      $("#liveBattery").textContent = "No battery";
    }
    if (s.category === "distraction" && Date.now() - distractionNudgeAt > 10 * 60 * 1000) {
      distractionNudgeAt = Date.now();
      koko.react("surprised", 2500);
      koko.say(`Hmm, ${s.app}? Just a little break, okay? ;)`);
    }
    updateRing(s.today_active_secs, s.goal_secs || goalSecs());
    if (Date.now() - lastSummaryFetch > 30000) refreshToday();
  }

  function onEvent(e) {
    const m = REACT[e.kind];
    if (m) koko.react(m, e.kind === "goal" ? 6000 : 3500);
    koko.say(e.message, 7000);
    if (e.kind === "goal" || e.kind === "worklog") refreshToday();
  }

  function updateRing(active, goal) {
    const pct = goal ? Math.min(1, active / goal) : 0;
    $("#goalRing").style.strokeDashoffset = (314.16 * (1 - pct)).toFixed(1);
    $("#goalPct").textContent = Math.round(pct * 100) + "%";
  }

  // ------------------------------------------------------------ Today / Week
  async function refreshToday() {
    lastSummaryFetch = Date.now();
    const d = await api.invoke("day_summary", {});
    $("#kActive").textContent = fmt(d.active_secs);
    $("#kFocus").textContent = fmt(d.focus_secs);
    $("#kIdle").textContent = fmt(d.idle_secs);
    $("#kFirst").textContent = d.sessions[0] ? clock(d.sessions[0].start_ts) : "—";
    updateRing(d.active_secs, goalSecs());

    const max = Math.max(1, ...d.apps.map((a) => a.seconds));
    $("#appList").innerHTML = d.apps.length ? d.apps.map((a) => `
      <div class="app-row ${a.category}">
        <span class="name">${esc(a.app)}${a.category !== "neutral" ? `<span class="tag">${a.category}</span>` : ""}</span><b>${fmt(a.seconds)}</b>
        <span class="bar"><i style="width:${(a.seconds / max * 100).toFixed(1)}%"></i></span>
      </div>`).join("") : `<div class="empty">No activity yet — I'm watching~</div>`;

    $("#sessionList").innerHTML = d.sessions.length ? d.sessions.slice().reverse().map((s) => {
      const live = !s.end_ts;
      const end = s.end_ts || s.last_seen_ts;
      return `<div class="session"><span>${live ? '<span class="live-dot"></span>' : ""}${clock(s.start_ts)} → ${live ? "now" : clock(end)}</span>
        <span>${fmt((live ? Date.now() / 1000 : end) - s.start_ts)}${s.end_reason ? ` · ${esc(s.end_reason)}` : ""}</span></div>`;
    }).join("") : `<div class="empty">No sessions yet.</div>`;
  }

  async function refreshWeek() {
    const w = await api.invoke("week_summary");
    const max = Math.max(goalSecs(), ...w.map((d) => d.active_secs), 1);
    $("#weekChart").innerHTML = w.map((d) => {
      const day = new Date(d.date + "T12:00:00").toLocaleDateString([], { weekday: "short" });
      const h = (d.active_secs / max) * 100;
      const f = d.active_secs ? (d.focus_secs / d.active_secs) * 100 : 0;
      return `<div class="wbar"><b>${fmt(d.active_secs)}</b><div class="stack" style="height:${h}%"><i style="height:${f}%"></i></div>${day}</div>`;
    }).join("");
  }

  // ------------------------------------------------------------ Journal
  async function refreshJournal() {
    const items = await api.invoke("list_journal", {});
    $("#journalList").innerHTML = items.length ? items.map((j) => `
      <div class="entry ${j.done ? "done" : ""}" data-id="${j.id}">
        ${j.kind === "task" ? `<input type="checkbox" ${j.done ? "checked" : ""} data-act="toggle" />` : ""}
        <div class="txt">${esc(j.text)}<div class="meta">${clock(j.ts)} · ${j.kind}${j.mood ? " · feeling " + esc(j.mood) : ""}</div></div>
        <button data-act="del">✕</button>
      </div>`).join("") : `<div class="empty">Nothing yet. ${esc(pick(profile.journal_prompts))}</div>`;
  }

  $("#kindSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    journalKind = b.dataset.kind;
    $$("#kindSeg button").forEach((x) => x.classList.toggle("on", x === b));
  });
  $("#moodPick").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    journalMood = journalMood === b.dataset.mood ? null : b.dataset.mood;
    $$("#moodPick button").forEach((x) => x.classList.toggle("on", x.dataset.mood === journalMood));
  });
  async function addEntry() {
    const text = $("#journalText").value.trim();
    if (!text) return;
    await api.invoke("add_journal", { kind: journalKind, mood: journalMood, text });
    $("#journalText").value = "";
    const reply = { great: ["excited", "Yay! Love that energy!"], good: ["giggle", "Nice~ keep it up!"], okay: ["happy", "Okay days count too!"],
      tired: ["tired", "Rest a little, okay? You deserve it."], stressed: ["worried", "Deep breath... you've got this. I'm here!"] }[journalMood]
      || (journalKind === "task" ? ["focused", "Task added! Let's crush it!"] : ["happy", "Saved to today's log~"]);
    koko.react(reply[0], 2800); koko.say(reply[1]);
    refreshJournal();
  }
  $("#journalAdd").addEventListener("click", addEntry);
  $("#journalText").addEventListener("keydown", (e) => e.key === "Enter" && addEntry());
  $("#journalList").addEventListener("click", async (e) => {
    const row = e.target.closest(".entry"); if (!row) return;
    const id = Number(row.dataset.id);
    if (e.target.dataset.act === "toggle") {
      await api.invoke("toggle_task", { id });
      if (e.target.checked) { koko.react("excited", 2000); koko.say("Task done! You rock!"); }
    }
    if (e.target.dataset.act === "del") await api.invoke("delete_journal", { id });
    refreshJournal();
  });

  // ------------------------------------------------------------ Settings / profiles
  function renderProfileGrid(sel, onboarding) {
    $(sel).innerHTML = profiles.map((p) => `
      <button class="pcard ${p.id === settings.profile ? "on" : ""}" data-id="${p.id}" style="--pc:${p.accent}">
        <span class="dot" style="background:${p.accent}"></span><b>${p.name}</b><span>${p.tagline}</span>
        <small>${p.daily_goal_hours}h goal · break every ${p.break_minutes}m</small>
      </button>`).join("");
    $(sel).onclick = async (e) => {
      const b = e.target.closest(".pcard"); if (!b) return;
      settings.profile = b.dataset.id;
      settings.daily_goal_hours = null; settings.break_minutes = null;
      if (onboarding) settings.onboarded = true;
      settings = await api.invoke("save_settings", { settings });
      applyProfile(); fillSettings(); refreshToday();
      if (onboarding) { $("#onboard").hidden = true; greet(); }
      else { koko.react("excited", 2200); koko.say(`${profile.name} mode! ${pick(profile.cheers)}`); }
    };
  }

  function fillSettings() {
    $("#sUser").value = settings.user_name;
    $("#sMascot").value = settings.mascot_name;
    $("#sGoal").value = settings.daily_goal_hours ?? profile.daily_goal_hours;
    $("#sBreak").value = settings.break_minutes ?? profile.break_minutes;
    $("#sBatt").value = settings.low_battery_percent;
    $("#sNBatt").checked = settings.notify_battery;
    $("#sNBreak").checked = settings.notify_breaks;
    $("#sNLog").checked = settings.notify_worklog;
    $("#sWidget").checked = settings.show_widget !== false;
  }

  $("#saveSettings").addEventListener("click", async () => {
    const goal = parseFloat($("#sGoal").value), brk = parseInt($("#sBreak").value, 10);
    settings = await api.invoke("save_settings", { settings: {
      ...settings,
      user_name: $("#sUser").value.trim(),
      mascot_name: $("#sMascot").value.trim() || "Koko",
      daily_goal_hours: goal && goal !== profile.daily_goal_hours ? goal : null,
      break_minutes: brk && brk !== profile.break_minutes ? brk : null,
      low_battery_percent: parseFloat($("#sBatt").value) || 20,
      notify_battery: $("#sNBatt").checked,
      notify_breaks: $("#sNBreak").checked,
      notify_worklog: $("#sNLog").checked,
      show_widget: $("#sWidget").checked,
    }});
    toast("Settings saved");
    koko.react("giggle", 2000); koko.say(`Got it${userName()}! I'll remember that~`);
    refreshToday();
  });
  $("#testNotify").addEventListener("click", () => api.invoke("test_notification").then(() => toast("Notification sent")).catch((e) => toast(String(e))));

  // Esc hides the dashboard popup; CoKo keeps running as the widget.
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && T) api.invoke("hide_dashboard"); });

  // ------------------------------------------------------------ tabs
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + t.dataset.tab));
    if (t.dataset.tab === "week") refreshWeek();
    if (t.dataset.tab === "journal") refreshJournal();
    if (t.dataset.tab === "today") refreshToday();
  }));

  // ------------------------------------------------------------ boot
  (async function boot() {
    $("#todayDate").textContent = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    const b = await api.invoke("bootstrap");
    settings = b.settings; profiles = b.profiles;
    applyProfile(); fillSettings();
    if (b.status && b.status.session_start) onStatus(b.status);
    await api.listen("coko-status", (e) => onStatus(e.payload));
    await api.listen("coko-event", (e) => onEvent(e.payload));
    await api.listen("dashboard-shown", () => { refreshToday(); koko.react("wave", 1800); });
    refreshToday();
    if (!settings.onboarded) { renderProfileGrid("#onboardGrid", true); $("#onboard").hidden = false; }
    else greet();
  })();

  // ------------------------------------------------------------ demo backend (browser preview only)
  function demoBackend() {
    const now = () => Math.floor(Date.now() / 1000);
    const start = now() - 3 * 3600 - 1200;
    const P = (id, name, tagline, accent, g, b, cheers, prompts) => ({ id, name, tagline, accent, daily_goal_hours: g, break_minutes: b, idle_seconds: 300, cheers, journal_prompts: prompts });
    const profiles = [
      P("student", "Student", "Study streaks, focus blocks and assignment check-ins", "#ff7eb6", 4, 45, ["Study mode: ON!"], ["What did you learn today?"]),
      P("developer", "Developer", "Coding time, deep-work sessions and commit-day logs", "#7aa2ff", 6, 60, ["Compiling happiness... done!", "You're in the flow — keep going!"], ["What did you ship today?"]),
      P("freelancer", "Freelancer", "Billable hours, client work and daily earnings notes", "#ffb547", 5, 50, ["Cha-ching! Hours logged~"], ["How many billable hours?"]),
      P("office", "Office", "Work hours, meetings and end-of-day reports", "#4fd1a5", 8, 60, ["Inbox hero~"], ["What did you finish today?"]),
      P("personal", "Personal", "Screen-time balance, habits and a gentle daily journal", "#b48cff", 3, 40, ["Remember to stretch!"], ["How are you feeling today?"]),
    ];
    let settings = { show_widget: true, profile: "developer", mascot_name: "Koko", user_name: "Bharath", daily_goal_hours: null, break_minutes: null, notify_battery: true, notify_breaks: true, notify_worklog: true, low_battery_percent: 20, onboarded: true };
    let journal = [{ id: 1, date: "", ts: now() - 3000, kind: "task", mood: null, text: "Finish tracker settings page", done: true }, { id: 2, date: "", ts: now() - 900, kind: "note", mood: "good", text: "Fixed the idle-time bug!", done: false }];
    const listeners = {};
    let batt = 64, active = 3 * 3600 + 540;
    setInterval(() => {
      active += 5; batt = Math.max(5, batt - 0.05);
      const s = { state: "active", app: "Visual Studio Code", title: "tracker.rs — coko", category: "focus", idle_secs: 2, continuous_active_secs: 1980, battery_percent: batt, charging: false, today_active_secs: active, today_focus_secs: 2 * 3600 + 400, goal_secs: 6 * 3600, session_start: start };
      (listeners["coko-status"] || []).forEach((f) => f({ payload: s }));
    }, 1500);
    const apps = [["Visual Studio Code", "focus", 6300], ["Firefox", "neutral", 2400], ["Terminal", "focus", 1900], ["Slack", "neutral", 900], ["YouTube", "distraction", 640]];
    return {
      listen: async (n, f) => { (listeners[n] ||= []).push(f); },
      invoke: async (cmd, a = {}) => {
        switch (cmd) {
          case "bootstrap": return { settings, profiles, status: null };
          case "save_settings": settings = a.settings; return settings;
          case "day_summary": return { active_secs: active, idle_secs: 1260, focus_secs: 2 * 3600 + 400, distraction_secs: 640, apps: apps.map(([app, category, seconds]) => ({ app, category, seconds })),
            sessions: [{ id: 1, start_ts: start - 5 * 3600, end_ts: start - 3 * 3600, last_seen_ts: start - 3 * 3600, end_reason: "shutdown/logout" }, { id: 2, start_ts: start, end_ts: null, last_seen_ts: now() }] };
          case "week_summary": return [5.2, 6.4, 3.1, 7.0, 4.4, 1.2, active / 3600].map((h, i) => ({ date: new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10), active_secs: h * 3600, focus_secs: h * 2200 }));
          case "list_journal": return journal.slice().reverse();
          case "add_journal": journal.push({ id: Date.now(), ts: now(), kind: a.kind, mood: a.mood, text: a.text, done: false }); return 1;
          case "toggle_task": journal.forEach((j) => j.id === a.id && (j.done = !j.done)); return;
          case "delete_journal": journal = journal.filter((j) => j.id !== a.id); return;
          default: return null;
        }
      },
    };
  }
})();
