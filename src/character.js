// Character layer shared by the dashboard and the desktop widget.
//
// Two renderers expose the same API (el, apply, setMood, react, say):
//   * SpriteCharacter: PNG art (for example generated with ComfyUI) listed in
//     assets/koko/sprites.js. It moves smoothly with procedural motion
//     (breathing, bobbing, swaying, hops and squash), and mood changes crossfade.
//   * Koko (mascot.js): the built-in vector mascot, used when no sprites exist.
(function () {
  // Fallback order when a mood has no sprite of its own.
  const ALIAS = {
    happy: ["happy"],
    focused: ["focused", "happy"],
    sleepy: ["sleepy", "tired", "happy"],
    tired: ["tired", "sleepy", "worried", "happy"],
    worried: ["worried", "tired", "surprised", "happy"],
    panic: ["panic", "worried", "surprised", "happy"],
    excited: ["excited", "giggle", "wave", "happy"],
    giggle: ["giggle", "excited", "happy"],
    love: ["love", "excited", "giggle", "happy"],
    surprised: ["surprised", "worried", "happy"],
    wave: ["wave", "excited", "happy"],
  };

  // Procedural motion per mood. Values are blended frame-by-frame, so switching
  // mood never snaps.
  //   bob: px up/down · hop: px bounce · per: seconds per cycle · tilt: deg sway
  //   breath: squash-stretch amount · jitter: px shake
  const MOTION = {
    happy:     { bob: 3,   hop: 0,  per: 3.0, tilt: 2.0, breath: 0.018, jitter: 0 },
    focused:   { bob: 1.2, hop: 0,  per: 2.2, tilt: 0.8, breath: 0.010, jitter: 0 },
    sleepy:    { bob: 2,   hop: 0,  per: 5.0, tilt: 6.0, breath: 0.035, jitter: 0 },
    tired:     { bob: 1.5, hop: 0,  per: 4.4, tilt: 3.0, breath: 0.028, jitter: 0 },
    worried:   { bob: 2,   hop: 0,  per: 1.6, tilt: 1.5, breath: 0.015, jitter: 0.5 },
    panic:     { bob: 1,   hop: 0,  per: 0.5, tilt: 2.5, breath: 0.010, jitter: 2.2 },
    excited:   { bob: 0,   hop: 12, per: 0.6, tilt: 4.0, breath: 0.030, jitter: 0 },
    giggle:    { bob: 0,   hop: 7,  per: 0.45, tilt: 5.0, breath: 0.030, jitter: 0 },
    love:      { bob: 4,   hop: 0,  per: 1.8, tilt: 5.0, breath: 0.022, jitter: 0 },
    surprised: { bob: 0,   hop: 4,  per: 1.0, tilt: 0.0, breath: 0.000, jitter: 0 },
    wave:      { bob: 3,   hop: 0,  per: 1.2, tilt: 6.0, breath: 0.018, jitter: 0 },
  };

  const FX = {
    sleepy: ["zzz"], tired: ["sweat"], worried: ["sweat"], panic: ["sweat", "bang"],
    excited: ["sparkle"], giggle: ["sparkle"], love: ["heart"], surprised: ["bang"],
  };

  class SpriteCharacter {
    constructor(el, bubble, sprites) {
      this.el = el;
      this.bubble = bubble;
      this.sprites = sprites;
      this.mood = null;
      this.baseMood = "happy";
      this.tempTimer = null;
      this.sayTimer = null;
      el.classList.add("sprite-char");
      el.innerHTML = `
        <div class="sc-shadow"></div>
        <div class="sc-rig"><img class="sc-img" alt="" draggable="false"><img class="sc-img" alt="" draggable="false"></div>
        <div class="sc-fx">
          <span class="fx fx-zzz">Z<small>z</small><small>z</small></span>
          <span class="fx fx-sweat"></span>
          <span class="fx fx-sparkle"><i>✦</i><i>✧</i><i>✦</i></span>
          <span class="fx fx-heart">♥</span>
          <span class="fx fx-bang">!</span>
        </div>`;
      this.rig = el.querySelector(".sc-rig");
      this.shadow = el.querySelector(".sc-shadow");
      this.imgs = [...el.querySelectorAll(".sc-img")];
      this.front = 0;
      // Preload every frame so crossfades never flash.
      Object.values(sprites).forEach((src) => { const i = new Image(); i.src = src; });

      this.cur = { ...MOTION.happy };
      this.target = MOTION.happy;
      this.impulse = 0;      // squash on click / reaction, decays
      this.lean = 0;         // eases toward the cursor
      this.leanTarget = 0;
      this.t0 = performance.now();
      window.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        this.leanTarget = Math.max(-1, Math.min(1, dx / 200));
      });
      el.addEventListener("mousedown", () => (this.impulse = 1));
      this.apply("happy");
      requestAnimationFrame((t) => this.frame(t));
    }

    spriteFor(mood) {
      for (const m of ALIAS[mood] || [mood, "happy"]) if (this.sprites[m]) return this.sprites[m];
      return this.sprites.happy || this.sprites.base || Object.values(this.sprites)[0];
    }

    apply(mood) {
      const src = this.spriteFor(mood);
      const shown = this.imgs[this.front];
      if (shown.getAttribute("src") !== src) {
        const back = this.imgs[1 - this.front];
        back.onload = () => {
          back.classList.add("on");
          shown.classList.remove("on");
          this.front = 1 - this.front;
        };
        back.src = src;
        if (back.complete) back.onload();
      } else {
        shown.classList.add("on");
      }
      this.el.className = this.el.className.replace(/\b(mood|fx)-\S+/g, "").trim();
      this.el.classList.add(`mood-${mood}`, ...(FX[mood] || []).map((f) => `fx-${f}`));
      this.target = MOTION[mood] || MOTION.happy;
      if (mood !== this.mood) this.impulse = Math.max(this.impulse, 0.6);
      this.mood = mood;
      this.el.dispatchEvent(new CustomEvent("mood", { detail: mood }));
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
      this.bubble.classList.remove("show");
      void this.bubble.offsetWidth;
      this.bubble.classList.add("show");
      this.sayTimer = setTimeout(() => this.bubble.classList.remove("show"), ms);
    }

    frame(now) {
      const k = 0.06; // blend speed between moods
      for (const key in this.cur) this.cur[key] += (this.target[key] - this.cur[key]) * k;
      this.lean += (this.leanTarget - this.lean) * 0.05;
      this.impulse *= 0.9;
      const c = this.cur;
      const t = (now - this.t0) / 1000;
      const ph = (t / c.per) * Math.PI * 2;
      const bob = Math.sin(ph) * c.bob;
      const hop = Math.abs(Math.sin(ph)) * c.hop;
      const tilt = Math.sin(ph * 0.5) * c.tilt + this.lean * 3;
      const breath = Math.sin(ph) * c.breath;
      const squash = Math.sin(this.impulse * Math.PI) * 0.08 * this.impulse;
      const jx = c.jitter ? (Math.random() - 0.5) * c.jitter : 0;
      const sx = 1 + breath * 0.6 + squash;
      const sy = 1 - breath * 0.4 - squash;
      this.rig.style.transform =
        `translate(${jx.toFixed(2)}px, ${(-bob - hop).toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      const lift = (bob + hop) / 20;
      this.shadow.style.transform = `translateX(-50%) scale(${(1 - lift * 0.3).toFixed(3)})`;
      this.shadow.style.opacity = (0.35 - lift * 0.15).toFixed(3);
      requestAnimationFrame((n) => this.frame(n));
    }
  }

  function deriveMood(s, settings, profile) {
    const pct = s.battery_percent, charging = s.charging;
    if (pct != null && !charging && pct <= 10) return "panic";
    if (pct != null && !charging && pct <= settings.low_battery_percent) return "worried";
    if (s.state === "away") return "sleepy";
    const brk = (settings.break_minutes ?? profile.break_minutes) * 60;
    if (s.continuous_active_secs >= brk * 0.85) return "tired";
    if (s.category === "focus") return "focused";
    return "happy";
  }

  const REACT = {
    break: "tired", battery_low: "worried", battery_critical: "panic", battery_full: "excited",
    plugged: "love", unplugged: "surprised", goal: "excited", worklog: "wave", welcome_back: "wave", away: "sleepy",
  };

  window.Character = {
    create(el, bubble) {
      const sprites = window.KOKO_SPRITES || {};
      return Object.keys(sprites).length ? new SpriteCharacter(el, bubble, sprites) : new window.Koko(el, bubble);
    },
    deriveMood,
    REACT,
  };
})();
