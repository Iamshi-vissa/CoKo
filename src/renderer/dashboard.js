// Dashboard popup: today's log, quests (journal), week and setup.
(async function () {
  const { Character, deriveMood, REACT, fmt } = window.CokoCharacter;
  const api = window.coko;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const boot = await api.bootstrap();
  let settings = boot.settings;
  const profiles = boot.profiles;
  let profile;
  let status = boot.status || {};
  let kind = 'task', mood = null;

  const portrait = new Character($('#portrait'), { bubble: $('#say'), manifest: boot.character });
  const goalSecs = () => (settings.goalHours ?? profile.goalHours) * 3600;

  function applyProfile() {
    profile = profiles.find((p) => p.id === settings.profile) || profiles[1];
    document.documentElement.style.setProperty('--accent', profile.accent);
    $('#name').textContent = settings.mascotName || 'Koko';
    $('#rankName').textContent = `${profile.name} buddy`;
    $('#prompt').textContent = pick(profile.prompts);
    renderTypes();
  }

  function toast(t) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  }

  // ------------------------------------------------ tabs
  function showTab(name) {
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    $$('.view').forEach((v) => (v.hidden = v.id !== `view-${name}`));
    if (name === 'today') refreshToday();
    if (name === 'quests') refreshQuests();
    if (name === 'week') refreshWeek();
    if (name === 'setup') fillSetup();
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#close').addEventListener('click', () => api.hideDashboard());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && settings.onboarded) api.hideDashboard(); });

  // ------------------------------------------------ header
  function renderHeader(active, level) {
    const g = goalSecs();
    const pct = Math.min(100, (active / (g || 1)) * 100);
    $('#expFill').style.width = pct + '%';
    $('#expBar').setAttribute('aria-valuenow', Math.round(pct));
    $('#expText').textContent = pct >= 100 ? `Goal cleared! ${fmt(active)} today` : `${fmt(active)} of ${fmt(g)} today`;
    if (level) $('#level').textContent = `Lv ${level}`;
  }

  // ------------------------------------------------ today
  const REASON = { login: 'Logged in', unlocked: 'Unlocked', wake: 'Woke up', active: 'Back at the desk', locked: 'locked', sleep: 'went to sleep', shutdown: 'shut down', 'shutdown/crash': 'shut down', quit: 'quit CoKo' };

  async function refreshToday() {
    const d = await api.summary();
    $('#active').textContent = fmt(d.active);
    $('#focus').textContent = fmt(d.focus);
    $('#idle').textContent = fmt(d.idle);
    $('#first').textContent = d.first ? clock(d.first) : '–';
    renderHeader(d.active, d.level);

    const nowH = new Date().getHours();
    const max = Math.max(900, ...d.hours);
    $('#strip').innerHTML = d.hours.map((s, h) =>
      `<i class="${s > 0 ? 'on' : ''} ${h === nowH ? 'now' : ''}" style="height:${Math.max(4, (s / max) * 100)}%" title="${h}:00 – ${fmt(s)} active"></i>`).join('');

    $('#log').innerHTML = d.sessions.length ? d.sessions.slice().reverse().map((s) => {
      const end = s.live ? Date.now() : (s.end ?? s.last);
      const how = `${REASON[s.startReason] || 'Started'} ${clock(s.start)}`;
      const until = s.live ? 'now' : `${REASON[s.endReason] || 'ended'} ${clock(end)}`;
      return `<li class="${s.live ? 'live' : ''}"><span>${how} <span class="why">→ ${until}</span></span><span class="dur">${fmt((end - s.start) / 1000)}</span></li>`;
    }).join('') : '<li class="empty">No sessions yet today.</li>';

    const top = Math.max(1, ...d.apps.map((a) => a.secs));
    $('#apps').innerHTML = d.apps.length ? d.apps.map((a) => `
      <li class="${a.cat}"><span class="nm">${esc(a.app)}${a.cat !== 'neutral' ? `<em>${a.cat}</em>` : ''}</span><b>${fmt(a.secs)}</b>
      <span class="bar"><i style="width:${(a.secs / top) * 100}%"></i></span></li>`).join('')
      : '<li class="empty">Nothing tracked yet. Keep working and I\'ll fill this in.</li>';
  }

  function renderBattery(b) {
    const row = $('#hpRow');
    if (!b) { row.className = 'hp none'; return; }
    const p = Math.round(b.percent);
    row.className = 'hp' + (b.charging ? ' chg' : p <= settings.lowBattery ? ' low' : '');
    $('#hpFill').style.width = p + '%';
    $('#hpText').textContent = `${p}%${b.charging ? ' charging' : ''}`;
  }

  // ------------------------------------------------ quests
  async function refreshQuests() {
    const items = await api.journal.list();
    const icon = { task: '', note: '✎', worklog: '⏱' };
    $('#quests').innerHTML = items.length ? items.map((j) => `
      <li class="${j.done ? 'done' : ''}" data-id="${j.id}">
        ${j.kind === 'task' ? `<input type="checkbox" ${j.done ? 'checked' : ''} aria-label="Mark quest done" />` : `<span class="kind" aria-hidden="true">${icon[j.kind] || '✎'}</span>`}
        <span class="tx">${esc(j.text)}<span class="meta">${clock(j.t)}${j.mood ? `, feeling ${esc(j.mood)}` : ''}</span></span>
        <button class="del" aria-label="Delete">✕</button>
      </li>`).join('') : `<li class="empty">No quests yet. ${esc(pick(profile.prompts))}</li>`;
  }
  const chipGroup = (sel, set, toggle) => $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const on = toggle && b.classList.contains('on');
    $$(`${sel} button`).forEach((x) => x.classList.toggle('on', x === b && !on));
    set(on ? null : b.dataset.v);
  });
  chipGroup('#kind', (v) => (kind = v || 'task'));
  chipGroup('#mood', (v) => (mood = v), true);
  $('#questForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#questText').value.trim();
    if (!text) return;
    await api.journal.add({ kind, mood, text });
    $('#questText').value = '';
    const reply = { great: ['excited', 'Yay! Love that energy!'], good: ['giggle', 'Nice~ keep it up!'], tired: ['tired', 'Rest a little, okay?'], stressed: ['worried', "Deep breath. I'm right here."] }[mood]
      || (kind === 'task' ? ['excited', 'Quest accepted!'] : ['wave', 'Saved to today~']);
    portrait.react(reply[0], 2600); portrait.say(reply[1], 2600);
    refreshQuests();
  });
  $('#quests').addEventListener('click', async (e) => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const id = Number(li.dataset.id);
    if (e.target.matches('input[type=checkbox]')) {
      await api.journal.toggle(id);
      if (e.target.checked) { portrait.react('excited', 2200); portrait.say('Quest complete! +EXP', 2200); }
    } else if (e.target.closest('.del')) await api.journal.remove(id);
    refreshQuests();
  });

  // ------------------------------------------------ week
  async function refreshWeek() {
    const w = await api.week();
    const g = goalSecs();
    const max = Math.max(g * 1.15, ...w.map((d) => d.active), 1);
    const total = w.reduce((a, d) => a + d.active, 0);
    const met = w.filter((d) => d.active >= g).length;
    $('#weekTotal').textContent = `${fmt(total)} this week. Goal cleared on ${met} of 7 days.`;
    $('#week').innerHTML = `<span class="goal" style="bottom:${(g / max) * 100}%"></span>` + w.map((d, i) => {
      const day = new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' });
      const h = (d.active / max) * 100, f = d.active ? (d.focus / d.active) * 100 : 0;
      return `<div class="wbar ${i === 6 ? 'today' : ''}"><b>${d.active ? fmt(d.active) : ''}</b><div class="col" style="height:calc(${h}% - 34px)"><i style="height:${f}%"></i></div>${day}</div>`;
    }).join('');
  }

  // ------------------------------------------------ setup
  function renderTypes() {
    $('#types').innerHTML = profiles.map((p) => `
      <button type="button" class="type ${p.id === settings.profile ? 'on' : ''}" data-id="${p.id}" style="--pc:${p.accent}" aria-pressed="${p.id === settings.profile}">
        <span class="em" aria-hidden="true">${p.emoji}</span><b>${p.name}</b><span>${p.tagline}. ${p.goalHours}h goal, break every ${p.breakMinutes} min.</span>
      </button>`).join('');
  }
  $('#types').addEventListener('click', async (e) => {
    const b = e.target.closest('.type'); if (!b) return;
    const first = !settings.onboarded;
    settings = await api.saveSettings({ profile: b.dataset.id, goalHours: null, breakMinutes: null, onboarded: true });
    applyProfile(); fillSetup();
    $('#welcome').hidden = true;
    portrait.react('excited', 2400);
    portrait.say(first ? `Yay! ${profile.name} mode. Let's go~` : `${profile.name} mode on!`, 2600);
    if (first) setTimeout(() => showTab('today'), 900);
  });
  function fillSetup() {
    $('#welcome').hidden = !!settings.onboarded;
    $('#sUser').value = settings.userName;
    $('#sMascot').value = settings.mascotName;
    $('#sGoal').value = settings.goalHours ?? profile.goalHours;
    $('#sBreak').value = settings.breakMinutes ?? profile.breakMinutes;
    $('#sBatt').value = settings.lowBattery;
    $(`.size input[value="${settings.widgetSize}"]`).checked = true;
    $('#sWidget').checked = settings.showWidget;
    $('#sNBreak').checked = settings.notifyBreaks;
    $('#sNBatt').checked = settings.notifyBattery;
    $('#sNLog').checked = settings.notifyWorklog;
  }
  $('#save').addEventListener('click', async () => {
    const goal = parseFloat($('#sGoal').value), brk = parseInt($('#sBreak').value, 10);
    settings = await api.saveSettings({
      userName: $('#sUser').value.trim(),
      mascotName: $('#sMascot').value.trim() || 'Koko',
      goalHours: goal && goal !== profile.goalHours ? goal : null,
      breakMinutes: brk && brk !== profile.breakMinutes ? brk : null,
      lowBattery: parseFloat($('#sBatt').value) || 20,
      widgetSize: document.querySelector('.size input:checked')?.value || 'medium',
      showWidget: $('#sWidget').checked,
      notifyBreaks: $('#sNBreak').checked,
      notifyBattery: $('#sNBatt').checked,
      notifyWorklog: $('#sNLog').checked,
      onboarded: true,
    });
    applyProfile();
    toast('Saved');
    portrait.react('giggle', 1800);
    portrait.say(`Got it${settings.userName ? ', ' + settings.userName : ''}!`, 2000);
  });
  $('#testNotify').addEventListener('click', () => { api.testNotification(); toast('Notification sent'); });

  // ------------------------------------------------ live
  api.onStatus((s) => {
    status = s;
    portrait.setMood(deriveMood(s, settings, profile));
    renderHeader(s.todayActive);
    renderBattery(s.battery);
  });
  api.onEvent((e) => { const m = REACT[e.kind]; if (m) portrait.react(m, 3000); });
  api.onSettings((s) => { settings = s; applyProfile(); });
  api.onDashboardShown(({ tab } = {}) => {
    showTab(tab || (settings.onboarded ? 'today' : 'setup'));
    portrait.react('wave', 1600);
  });

  applyProfile();
  renderBattery(status.battery);
  showTab(settings.onboarded ? 'today' : 'setup');
  setInterval(() => { if (!document.hidden && !$('#view-today').hidden) refreshToday(); }, 30000);
})();
