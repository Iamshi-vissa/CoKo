// CoKo character player, shared by the widget and the dashboard portrait.
//
// The art comes from character/manifest.json (written by tools/make_character.py):
//   { "type": "video", "moods": { "idle": "idle.webm", "happy": "happy.webm", ... } }
//   { "type": "image", "moods": { "happy": "happy.png", ... } }
// Video loops are transparent VP9 WebM. Two <video> layers crossfade, so mood
// changes never pop. Still images get procedural motion (breathing, bobbing,
// swaying, hops). With no art yet, the built-in vector mascot is used.
(function () {
  const ALIAS = {
    idle: ['idle', 'happy'],
    happy: ['happy', 'idle'],
    focused: ['focused', 'idle', 'happy'],
    sleepy: ['sleepy', 'tired', 'idle'],
    tired: ['tired', 'sleepy', 'worried', 'idle'],
    worried: ['worried', 'tired', 'surprised', 'idle'],
    panic: ['panic', 'worried', 'surprised', 'idle'],
    excited: ['excited', 'wave', 'giggle', 'happy', 'idle'],
    giggle: ['giggle', 'excited', 'happy', 'idle'],
    love: ['love', 'excited', 'giggle', 'happy', 'idle'],
    surprised: ['surprised', 'worried', 'idle'],
    wave: ['wave', 'excited', 'happy', 'idle'],
  };
  const pickFile = (moods, mood) => {
    for (const m of ALIAS[mood] || [mood, 'idle', 'happy']) if (moods[m]) return moods[m];
    return Object.values(moods)[0];
  };

  // Motion layered on top of the art. Video already moves, so it only gets the
  // event reactions (squash on click, hop when excited), not idle sway.
  const MOTION = {
    idle:      { bob: 3,   hop: 0,  per: 3.2, tilt: 1.6, breath: .016, jitter: 0 },
    happy:     { bob: 3,   hop: 0,  per: 3.0, tilt: 2.0, breath: .018, jitter: 0 },
    focused:   { bob: 1.2, hop: 0,  per: 2.2, tilt: .8,  breath: .010, jitter: 0 },
    sleepy:    { bob: 2,   hop: 0,  per: 5.0, tilt: 6.0, breath: .035, jitter: 0 },
    tired:     { bob: 1.5, hop: 0,  per: 4.4, tilt: 3.0, breath: .028, jitter: 0 },
    worried:   { bob: 2,   hop: 0,  per: 1.6, tilt: 1.5, breath: .015, jitter: .5 },
    panic:     { bob: 1,   hop: 0,  per: .5,  tilt: 2.5, breath: .010, jitter: 2.2 },
    excited:   { bob: 0,   hop: 12, per: .6,  tilt: 4.0, breath: .030, jitter: 0 },
    giggle:    { bob: 0,   hop: 7,  per: .45, tilt: 5.0, breath: .030, jitter: 0 },
    love:      { bob: 4,   hop: 0,  per: 1.8, tilt: 5.0, breath: .022, jitter: 0 },
    surprised: { bob: 0,   hop: 4,  per: 1.0, tilt: 0,   breath: 0,    jitter: 0 },
    wave:      { bob: 3,   hop: 0,  per: 1.2, tilt: 6.0, breath: .018, jitter: 0 },
  };
  const VIDEO_MOTION = Object.fromEntries(Object.entries(MOTION).map(([k, v]) =>
    [k, { ...v, bob: 0, tilt: 0, breath: 0, hop: k === 'excited' || k === 'giggle' ? v.hop * .6 : 0 }]));

  const FX = { sleepy: ['zzz'], tired: ['sweat'], worried: ['sweat'], panic: ['sweat', 'bang'], excited: ['sparkle'], giggle: ['sparkle'], love: ['heart'], surprised: ['bang'] };
  const FX_HTML = `<div class="ch-fx"><span class="fx fx-zzz">Z<small>z</small><small>z</small></span><span class="fx fx-sweat"></span><span class="fx fx-sparkle"><i>✦</i><i>✧</i><i>✦</i></span><span class="fx fx-heart">♥</span><span class="fx fx-bang">!</span></div>`;

  class Character {
    constructor(el, { bubble, manifest, base = 'character/' } = {}) {
      this.el = el;
      this.bubble = bubble;
      this.type = manifest?.type || 'builtin';
      this.moods = manifest?.moods || {};
      this.base = base;
      this.mood = null;
      this.baseMood = 'idle';
      this.tempTimer = this.sayTimer = null;
      this.impulse = 0; this.lean = 0; this.leanTarget = 0;
      el.classList.add('ch', `ch-${this.type}`);
      el.innerHTML = `<div class="ch-shadow"></div><div class="ch-rig"></div>${FX_HTML}`;
      this.rig = el.querySelector('.ch-rig');
      this.shadow = el.querySelector('.ch-shadow');

      if (this.type === 'video') {
        this.layers = [0, 1].map(() => {
          const v = document.createElement('video');
          Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto', disablePictureInPicture: true });
          v.className = 'ch-layer';
          this.rig.appendChild(v);
          return v;
        });
      } else if (this.type === 'image') {
        this.layers = [0, 1].map(() => {
          const i = new Image(); i.className = 'ch-layer'; i.draggable = false; i.alt = '';
          this.rig.appendChild(i);
          return i;
        });
        Object.values(this.moods).forEach((f) => { const i = new Image(); i.src = this.base + f; });
      } else {
        const holder = document.createElement('div');
        holder.className = 'ch-builtin';
        this.rig.appendChild(holder);
        this.builtin = new window.Koko(holder, null);
      }
      this.front = 0;
      // Moods made from still images get the full procedural motion even in video mode.
      this.still = new Set(manifest?.still || []);
      this.motionFor = (m) => (this.type === 'video' && !this.still.has(m) ? VIDEO_MOTION : MOTION)[m] || MOTION.idle;
      this.cur = { ...this.motionFor('idle') };
      this.target = this.cur;
      this.t0 = performance.now();
      window.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        this.leanTarget = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 220));
      });
      this.apply('idle');
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame((t) => this.frame(t));
    }

    poke() { this.impulse = 1; }

    swap(src) {
      const shown = this.layers[this.front];
      const back = this.layers[1 - this.front];
      const full = this.base + src;
      if (shown.dataset.src === full) { shown.classList.add('on'); return; }
      const reveal = () => {
        back.classList.add('on'); shown.classList.remove('on');
        this.front = 1 - this.front;
        if (this.type === 'video') setTimeout(() => { if (!shown.classList.contains('on')) shown.pause(); }, 450);
      };
      back.dataset.src = full;
      if (this.type === 'video') {
        back.src = full;
        back.currentTime = 0;
        back.play().then(reveal).catch(reveal);
      } else {
        back.onload = reveal;
        back.src = full;
        if (back.complete && back.naturalWidth) reveal();
      }
    }

    apply(mood) {
      if (this.type === 'builtin') this.builtin.apply(mood === 'idle' ? 'happy' : mood);
      else this.swap(pickFile(this.moods, mood));
      this.el.className = this.el.className.replace(/\b(mood|fx)-\S+/g, '').trim();
      this.el.classList.add(`mood-${mood}`, ...(FX[mood] || []).map((f) => `fx-${f}`));
      this.target = this.motionFor(mood);
      if (mood !== this.mood) this.impulse = Math.max(this.impulse, .55);
      this.mood = mood;
      this.el.dispatchEvent(new CustomEvent('mood', { detail: mood }));
    }

    setMood(mood) {
      this.baseMood = mood;
      if (!this.tempTimer && this.mood !== mood) this.apply(mood);
    }

    react(mood, ms = 2600) {
      clearTimeout(this.tempTimer);
      this.apply(mood);
      this.tempTimer = setTimeout(() => { this.tempTimer = null; this.apply(this.baseMood); }, ms);
    }

    say(text, ms = 5000) {
      if (!this.bubble) return;
      clearTimeout(this.sayTimer);
      this.bubble.textContent = text;
      this.bubble.classList.remove('show'); void this.bubble.offsetWidth;
      this.bubble.classList.add('show');
      this.sayTimer = setTimeout(() => this.bubble.classList.remove('show'), ms);
    }

    frame(now) {
      const k = .06;
      for (const key in this.cur) this.cur[key] += (this.target[key] - this.cur[key]) * k;
      this.lean += (this.leanTarget - this.lean) * .05;
      this.impulse *= .9;
      const c = this.cur, t = (now - this.t0) / 1000;
      const ph = (t / c.per) * Math.PI * 2;
      const calm = this.reduced ? .25 : 1;
      const bob = Math.sin(ph) * c.bob * calm;
      const hop = Math.abs(Math.sin(ph)) * c.hop * calm;
      const tilt = (Math.sin(ph * .5) * c.tilt + this.lean * (this.type === 'video' ? 1.2 : 3)) * calm;
      const breath = Math.sin(ph) * c.breath * calm;
      const squash = Math.sin(this.impulse * Math.PI) * .08 * this.impulse;
      const jx = c.jitter ? (Math.random() - .5) * c.jitter * calm : 0;
      this.rig.style.transform = `translate(${jx.toFixed(2)}px,${(-bob - hop).toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${(1 + breath * .6 + squash).toFixed(4)},${(1 - breath * .4 - squash).toFixed(4)})`;
      const lift = (bob + hop) / 20;
      this.shadow.style.transform = `translateX(-50%) scale(${(1 - lift * .3).toFixed(3)})`;
      this.shadow.style.opacity = (.3 - lift * .12).toFixed(3);
      requestAnimationFrame((n) => this.frame(n));
    }
  }

  function deriveMood(s, settings, profile) {
    const b = s.battery;
    if (b && !b.charging && b.percent <= 10) return 'panic';
    if (b && !b.charging && b.percent <= settings.lowBattery) return 'worried';
    if (s.state === 'away') return 'sleepy';
    if (s.streak >= (s.breakSecs || 3600) * .85) return 'tired';
    if (s.category === 'focus') return 'focused';
    if (s.category === 'distraction') return 'surprised';
    return 'idle';
  }

  const REACT = { break: 'tired', battery_low: 'worried', battery_critical: 'panic', battery_full: 'excited', plugged: 'love', unplugged: 'surprised', goal: 'excited', worklog: 'wave', welcome_back: 'wave', away: 'sleepy' };

  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; };

  window.CokoCharacter = { Character, deriveMood, REACT, fmt };
})();
