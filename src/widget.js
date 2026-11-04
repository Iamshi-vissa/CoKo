// Desktop widget: an always-on-top mascot. Click it to open the dashboard,
// drag it to move it, and right-click it for a quick summary of today.
(function () {
  const $ = (s) => document.querySelector(s);
  const T = window.__TAURI__;
  const invoke = T ? T.core.invoke : async () => null;
  const listen = T ? T.event.listen : async () => {};
  const win = T ? T.window.getCurrentWindow() : null;

  const koko = Character.create($("#mascot"), $("#bubble"));
  let settings = { low_battery_percent: 20, mascot_name: "Koko", user_name: "" };
  let profile = { break_minutes: 60, cheers: ["Hi!"], journal_prompts: [] };
  let profiles = [];
  let status = {};

  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function applySettings(s) {
    settings = s;
    profile = profiles.find((p) => p.id === s.profile) || profile;
    document.documentElement.style.setProperty("--accent", profile.accent || "#7aa2ff");
  }

  // ------------------------------------------------ click vs drag
  let down = null, dragging = false;
  const stage = $("#stage");
  stage.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY };
    dragging = false;
  });
  window.addEventListener("mousemove", async (e) => {
    if (!down || dragging) return;
    if (Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
      dragging = true;
      document.body.classList.add("dragging");
      koko.react("surprised", 900);
      if (win) await win.startDragging();
      // When the OS drag ends, no mouseup reaches the page, so reset here.
      down = null; dragging = false;
      document.body.classList.remove("dragging");
      koko.react("giggle", 1200);
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0 || !down) return;
    const wasDrag = dragging;
    down = null; dragging = false;
    document.body.classList.remove("dragging");
    if (!wasDrag) {
      koko.react(pick(["wave", "giggle"]), 1500);
      invoke("toggle_dashboard");
    }
  });
  stage.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    koko.react("wave", 2500);
    const batt = status.battery_percent != null ? ` · battery ${Math.round(status.battery_percent)}%` : "";
    koko.say(`Today: ${fmt(status.today_active_secs)} active, ${fmt(status.today_focus_secs)} focused${batt}`, 5000);
    $("#badge").classList.add("pin");
    setTimeout(() => $("#badge").classList.remove("pin"), 5000);
  });

  // ------------------------------------------------ live updates
  function onStatus(s) {
    status = s;
    koko.setMood(Character.deriveMood(s, settings, profile));
    $("#bTime").textContent = fmt(s.today_active_secs);
    const goal = s.goal_secs || 1;
    $("#ring").style.strokeDashoffset = (94.25 * (1 - Math.min(1, s.today_active_secs / goal))).toFixed(1);
    const b = $("#bBatt");
    if (s.battery_percent != null) {
      const p = Math.round(s.battery_percent);
      b.textContent = `${p}%${s.charging ? "⚡" : ""}`;
      b.className = "w-batt " + (s.charging ? "chg" : p <= 10 ? "crit" : p <= settings.low_battery_percent ? "low" : "");
    } else b.textContent = "";
  }

  function onEvent(e) {
    const m = Character.REACT[e.kind];
    if (m) koko.react(m, e.kind === "goal" ? 6000 : 3500);
    koko.say(e.message, 6500);
  }

  // Occasional idle chatter.
  setInterval(() => {
    if (status.state === "away") return;
    if (Math.random() < 0.35) { koko.react("giggle", 1500); koko.say(pick(profile.cheers), 4000); }
  }, 5 * 60 * 1000);

  (async function boot() {
    const b = await invoke("bootstrap");
    if (b) {
      profiles = b.profiles;
      applySettings(b.settings);
      if (b.status && b.status.session_start) onStatus(b.status);
    }
    await listen("coko-status", (e) => onStatus(e.payload));
    await listen("coko-event", (e) => onEvent(e.payload));
    await listen("settings-changed", (e) => applySettings(e.payload));
    const h = new Date().getHours();
    koko.react("wave", 3000);
    koko.say(`${h < 12 ? "Good morning" : h < 17 ? "Hi there" : "Good evening"}${settings.user_name ? ", " + settings.user_name : ""}! Click me for your logs~`, 5500);
  })();
})();
