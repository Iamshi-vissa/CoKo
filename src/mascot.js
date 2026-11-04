// Koko — CoKo's original mascot. Pure SVG; moods are CSS classes on the root.
// Moods: happy, focused, sleepy, worried, panic, excited, tired, love, surprised, wave
(function () {
  const SVG = `
<svg viewBox="0 0 240 290" xmlns="http://www.w3.org/2000/svg" class="koko">
  <ellipse class="shadow" cx="120" cy="278" rx="62" ry="8"/>
  <g class="body">
    <!-- twin tails -->
    <g class="tails">
      <path class="hair-dark tail-l" d="M52 92 C14 110 8 170 30 214 C40 190 46 160 62 130 Z"/>
      <path class="hair-dark tail-r" d="M188 92 C226 110 232 170 210 214 C200 190 194 160 178 130 Z"/>
    </g>
    <!-- hoodie -->
    <path class="hoodie" d="M70 196 C70 176 92 166 120 166 C148 166 170 176 170 196 L176 262 C176 270 170 274 162 274 L78 274 C70 274 64 270 64 262 Z"/>
    <path class="hoodie-shade" d="M96 172 C104 186 136 186 144 172 C138 168 102 168 96 172 Z"/>
    <circle class="string" cx="110" cy="196" r="3"/><circle class="string" cx="130" cy="196" r="3"/>
    <rect class="pocket" x="94" y="232" width="52" height="22" rx="10"/>
    <!-- arms -->
    <g class="arm arm-l"><path class="hoodie" d="M74 190 C56 204 52 230 58 246 L72 244 C70 228 76 212 84 202 Z"/><circle class="skin" cx="64" cy="248" r="9"/></g>
    <g class="arm arm-r"><path class="hoodie" d="M166 190 C184 204 188 230 182 246 L168 244 C170 228 164 212 156 202 Z"/><circle class="skin" cx="176" cy="248" r="9"/></g>
    <!-- head -->
    <g class="head">
      <path class="hair-dark" d="M44 104 C44 52 80 26 120 26 C160 26 196 52 196 104 L198 150 C186 150 180 140 176 128 L64 128 C60 140 54 150 42 150 Z"/>
      <ellipse class="skin" cx="120" cy="112" rx="66" ry="62"/>
      <!-- bangs -->
      <path class="hair" d="M52 104 C50 58 82 36 120 36 C158 36 190 58 188 104 C178 92 172 78 168 64 C160 82 146 92 128 96 C132 86 132 76 128 68 C118 86 100 96 80 98 C84 90 86 82 84 74 C76 86 66 96 52 104 Z"/>
      <path class="shine" d="M88 52 C100 44 116 42 128 44" />
      <!-- headphones with cat ears -->
      <path class="band" d="M46 100 C46 40 194 40 194 100" />
      <path class="ear-cup ear-l" d="M58 52 L66 18 L90 40 Z"/><path class="ear-in" d="M64 44 L68 28 L80 40 Z"/>
      <path class="ear-cup ear-r" d="M182 52 L174 18 L150 40 Z"/><path class="ear-in" d="M176 44 L172 28 L160 40 Z"/>
      <rect class="cup" x="34" y="94" width="22" height="40" rx="11"/>
      <rect class="cup" x="184" y="94" width="22" height="40" rx="11"/>
      <circle class="cup-light" cx="45" cy="114" r="4"/><circle class="cup-light" cx="195" cy="114" r="4"/>

      <!-- brows -->
      <path class="brow brow-l" d="M78 92 Q92 86 104 90"/>
      <path class="brow brow-r" d="M136 90 Q148 86 162 92"/>

      <!-- eyes: open -->
      <g class="eyes eyes-open">
        <g class="eye"><ellipse class="eye-white" cx="92" cy="118" rx="15" ry="18"/>
          <g class="pupil"><ellipse class="iris" cx="92" cy="120" rx="11" ry="14"/><ellipse class="iris-in" cx="92" cy="123" rx="6" ry="8"/>
          <circle class="hl" cx="87" cy="113" r="4.5"/><circle class="hl" cx="97" cy="128" r="2"/></g>
          <path class="lash" d="M76 108 Q92 96 108 106"/></g>
        <g class="eye"><ellipse class="eye-white" cx="148" cy="118" rx="15" ry="18"/>
          <g class="pupil"><ellipse class="iris" cx="148" cy="120" rx="11" ry="14"/><ellipse class="iris-in" cx="148" cy="123" rx="6" ry="8"/>
          <circle class="hl" cx="143" cy="113" r="4.5"/><circle class="hl" cx="153" cy="128" r="2"/></g>
          <path class="lash" d="M132 106 Q148 96 164 108"/></g>
      </g>
      <!-- eyes: happy ^ ^ -->
      <g class="eyes eyes-happy"><path class="line" d="M78 124 Q92 104 106 124"/><path class="line" d="M134 124 Q148 104 162 124"/></g>
      <!-- eyes: closed / sleepy -->
      <g class="eyes eyes-closed"><path class="line" d="M78 120 Q92 130 106 120"/><path class="line" d="M134 120 Q148 130 162 120"/></g>
      <!-- eyes: stars -->
      <g class="eyes eyes-star">
        <path class="star" d="M92 102 L97 114 L110 116 L100 124 L103 137 L92 130 L81 137 L84 124 L74 116 L87 114 Z"/>
        <path class="star" d="M148 102 L153 114 L166 116 L156 124 L159 137 L148 130 L137 137 L140 124 L130 116 L143 114 Z"/>
      </g>
      <!-- eyes: swirl (panic) -->
      <g class="eyes eyes-swirl"><path class="line thin" d="M92 118 m-2 0 a2 2 0 1 1 4 0 a5 5 0 1 1 -10 0 a8 8 0 1 1 16 0 a11 11 0 1 1 -22 0"/>
        <path class="line thin" d="M148 118 m-2 0 a2 2 0 1 1 4 0 a5 5 0 1 1 -10 0 a8 8 0 1 1 16 0 a11 11 0 1 1 -22 0"/></g>

      <ellipse class="blush" cx="74" cy="142" rx="11" ry="6"/><ellipse class="blush" cx="166" cy="142" rx="11" ry="6"/>

      <!-- mouths -->
      <path class="mouth m-smile" d="M108 148 Q120 160 132 148"/>
      <path class="mouth m-cat" d="M106 148 Q113 156 120 148 Q127 156 134 148"/>
      <path class="mouth-fill m-open" d="M110 148 Q120 146 130 148 Q130 164 120 164 Q110 164 110 148 Z"/>
      <path class="mouth-fill m-grin" d="M104 146 L136 146 Q134 166 120 166 Q106 166 104 146 Z"/>
      <ellipse class="mouth-fill m-o" cx="120" cy="154" rx="6" ry="8"/>
      <path class="mouth m-flat" d="M110 152 L130 152"/>
      <path class="mouth m-wavy" d="M104 154 Q110 148 116 154 Q122 160 128 154 Q134 148 138 154"/>
    </g>
  </g>

  <!-- extras -->
  <g class="fx fx-zzz"><text x="182" y="60">Z</text><text x="198" y="40" class="s">z</text><text x="210" y="24" class="xs">z</text></g>
  <path class="fx fx-sweat" d="M182 86 C176 98 176 106 182 108 C188 106 188 98 182 86 Z"/>
  <g class="fx fx-sparkle"><path d="M30 60 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z"/><path d="M206 150 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z"/><path d="M200 30 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z"/></g>
  <path class="fx fx-heart" d="M196 70 C196 62 206 60 208 68 C210 60 220 62 220 70 C220 80 208 86 208 88 C208 86 196 80 196 70 Z"/>
  <path class="fx fx-bolt" d="M30 92 L20 116 L30 116 L24 136 L42 108 L32 108 L38 92 Z"/>
  <g class="fx fx-bang"><rect x="200" y="44" width="8" height="26" rx="4"/><circle cx="204" cy="80" r="4.5"/></g>
</svg>`;

  // Which face parts show for each mood.
  const MOODS = {
    happy:     { eyes: "open",   mouth: "smile", fx: [] },
    focused:   { eyes: "open",   mouth: "flat",  fx: [], brows: "focus" },
    sleepy:    { eyes: "closed", mouth: "o",     fx: ["zzz"] },
    worried:   { eyes: "open",   mouth: "wavy",  fx: ["sweat"], brows: "worry" },
    panic:     { eyes: "swirl",  mouth: "open",  fx: ["sweat", "bang"], brows: "worry" },
    excited:   { eyes: "star",   mouth: "grin",  fx: ["sparkle"] },
    tired:     { eyes: "closed", mouth: "wavy",  fx: ["sweat"], brows: "worry" },
    love:      { eyes: "happy",  mouth: "cat",   fx: ["heart", "bolt"] },
    surprised: { eyes: "open",   mouth: "o",     fx: ["bang"], brows: "up" },
    giggle:    { eyes: "happy",  mouth: "open",  fx: ["sparkle"] },
    wave:      { eyes: "happy",  mouth: "grin",  fx: [] },
  };

  class Koko {
    constructor(el, bubble) {
      this.el = el;
      this.bubble = bubble;
      el.innerHTML = SVG;
      this.svg = el.querySelector("svg");
      this.pupils = [...el.querySelectorAll(".pupil")];
      this.mood = "happy";
      this.baseMood = "happy";
      this.tempTimer = null;
      this.sayTimer = null;
      this.apply("happy");
      this.blinkLoop();
      window.addEventListener("mousemove", (e) => this.look(e.clientX, e.clientY));
    }

    apply(mood) {
      const m = MOODS[mood] || MOODS.happy;
      const cls = ["koko", `mood-${mood}`, `eyes-${m.eyes}-on`, `mouth-${m.mouth}-on`];
      m.fx.forEach((f) => cls.push(`fx-${f}-on`));
      if (m.brows) cls.push(`brows-${m.brows}`);
      this.svg.setAttribute("class", cls.join(" "));
      this.mood = mood;
      this.el.dispatchEvent(new CustomEvent("mood", { detail: mood }));
    }

    /** Persistent mood driven by tracking state. */
    setMood(mood) {
      this.baseMood = mood;
      if (!this.tempTimer && this.mood !== mood) this.apply(mood);
    }

    /** Short reaction that falls back to the base mood. */
    react(mood, ms = 2600) {
      clearTimeout(this.tempTimer);
      this.apply(mood);
      this.tempTimer = setTimeout(() => {
        this.tempTimer = null;
        this.apply(this.baseMood);
      }, ms);
    }

    say(text, ms = 5000) {
      clearTimeout(this.sayTimer);
      this.bubble.textContent = text;
      this.bubble.classList.remove("show");
      void this.bubble.offsetWidth;
      this.bubble.classList.add("show");
      this.sayTimer = setTimeout(() => this.bubble.classList.remove("show"), ms);
    }

    look(x, y) {
      const r = this.svg.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 300);
      const tx = (dx / d) * 4 * k, ty = (dy / d) * 4 * k;
      this.pupils.forEach((p) => p.setAttribute("transform", `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`));
    }

    blinkLoop() {
      const next = 2500 + Math.random() * 3500;
      setTimeout(() => {
        this.svg.classList.add("blink");
        setTimeout(() => this.svg.classList.remove("blink"), 140);
        this.blinkLoop();
      }, next);
    }
  }

  window.Koko = Koko;
})();
