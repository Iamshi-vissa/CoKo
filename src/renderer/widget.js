// Desktop buddy: click to open the day log, drag to move, right-click for a
// quick summary. She reacts to what the tracker reports.
(async function () {
  const { Character, deriveMood, REACT, fmt } = window.CokoCharacter;
  const api = window.coko;
  const $ = (s) => document.querySelector(s);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  const boot = await api.bootstrap();
  let settings = boot.settings;
  const profiles = boot.profiles;
  let profile = profiles.find((p) => p.id === settings.profile);
  let status = boot.status || {};

  const buddy = new Character($('#buddy'), { bubble: $('#bubble'), manifest: boot.character });
  const theme = () => document.documentElement.style.setProperty('--accent', profile.accent);
  theme();

  // ------------------------------------------------ click / drag
  const stage = $('#stage');
  let down = null, dragging = false;
  stage.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.screenX, y: e.screenY, ox: e.clientX, oy: e.clientY };
    buddy.poke();
  });
  window.addEventListener('mousemove', (e) => {
    if (!down || dragging) return;
    if (Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
      dragging = true;
      document.body.classList.add('dragging');
      buddy.react('surprised', 60000);
      api.dragStart(down.ox, down.oy);
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !down) return;
    const wasDrag = dragging;
    down = null; dragging = false;
    document.body.classList.remove('dragging');
    if (wasDrag) { api.dragEnd(); buddy.react('giggle', 1400); buddy.say('Wheee~ new spot!', 2200); }
    else { buddy.react('wave', 1400); api.toggleDashboard(); }
  });
  stage.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.toggleDashboard(); } });
  stage.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    buddy.react('wave', 2600);
    const b = status.battery ? `, battery ${Math.round(status.battery.percent)}%` : '';
    buddy.say(`Today: ${fmt(status.todayActive)} active, ${fmt(status.todayFocus)} focused${b}`, 5000);
    $('#chip').classList.add('pin'); setTimeout(() => $('#chip').classList.remove('pin'), 5000);
  });

  // ------------------------------------------------ live updates
  let nudgedAt = 0;
  function onStatus(s) {
    status = s;
    buddy.setMood(deriveMood(s, settings, profile));
    $('#chipTime').textContent = fmt(s.todayActive);
    $('#chipExp').style.width = `${Math.min(100, (s.todayActive / (s.goalSecs || 1)) * 100)}%`;
    const b = $('#chipBatt');
    if (s.battery) {
      const p = Math.round(s.battery.percent);
      b.textContent = `${p}%${s.battery.charging ? '⚡' : ''}`;
      b.className = s.battery.charging ? 'chg' : p <= settings.lowBattery ? 'low' : '';
    } else b.textContent = '';
    if (s.category === 'distraction' && Date.now() - nudgedAt > 15 * 60e3) {
      nudgedAt = Date.now();
      buddy.say(`${s.app}? Just a short break, okay?`, 4500);
    }
  }
  api.onStatus(onStatus);
  api.onEvent((e) => {
    const m = REACT[e.kind];
    if (m) buddy.react(m, e.kind === 'goal' ? 6000 : 3500);
    buddy.say(e.message, 6500);
  });
  api.onSettings((s) => { settings = s; profile = profiles.find((p) => p.id === s.profile); theme(); });
  if (status.state) onStatus(status);

  // Occasional chatter so she feels alive.
  setInterval(() => {
    if (status.state === 'away' || Math.random() > .35) return;
    buddy.react('giggle', 1500);
    buddy.say(pick(profile.cheers), 4000);
  }, 6 * 60e3);

  const h = new Date().getHours();
  const hello = h < 5 ? 'Up late again?' : h < 12 ? 'Good morning' : h < 17 ? 'Hey there' : 'Good evening';
  setTimeout(() => { buddy.react('wave', 3000); buddy.say(`${hello}${settings.userName ? ', ' + settings.userName : ''}! Click me for your day log~`, 5500); }, 600);
})();
