// Menus as physical objects: a sewing-pattern envelope (main menu), fabric
// swatches pinned to a corkboard (course select), a cross-stitch sampler
// (scorecard), a tin of buttons (settings). Plus the sewn-label HUD.
// Works with mouse, touch, keyboard and gamepad (spatial focus navigation).

import { COURSES, UNLOCK_THIMBLES, courseThimbles, courseUnlocked } from './holes/index.js';
import { store } from './storage.js';
import { ACTION_LABELS, keyName } from './input.js';
import { buildSampler } from './sampler.js';
import { PAL, offsetPolyline, pattern, pompomSprite, stitchLine, tracePath } from './art.js';
import { audio } from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function thimbleSvg(filled = true, size = 18) {
  const f = filled ? PAL.mustard : 'none';
  const s = filled ? PAL.mustardDeep : '#a8977c';
  return `<svg class="thimble${filled ? '' : ' empty'}" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 18 L5 7 Q10 0 15 7 L16 18 Z" fill="${f}" stroke="${s}" stroke-width="1.6"/><g fill="${filled ? PAL.mustardDeep : '#a8977c'}"><circle cx="8" cy="9" r=".9"/><circle cx="12" cy="9" r=".9"/><circle cx="10" cy="12" r=".9"/><circle cx="7.5" cy="14" r=".9"/><circle cx="12.5" cy="14" r=".9"/></g><rect x="3.5" y="16" width="13" height="2.6" rx="1" fill="${s}"/></svg>`;
}

function thimbleRow(n, size = 16) {
  return [0, 1, 2].map((i) => thimbleSvg(i < n, size)).join('');
}

class UI {
  init(app) {
    this.app = app;
    this.root = $('#ui');
    this.hudEl = $('#hud');
    this.toastEl = $('#toast');
    this.current = null;
    this.stack = [];
    this.buildHud();
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      audio.play('click');
      this.handle(el.dataset.act, el);
    });
    this.root.addEventListener('pointermove', (e) => {
      const el = e.target.closest('button, input');
      if (el && document.activeElement !== el && e.pointerType === 'mouse') el.focus({ preventScroll: true });
    });
  }

  get open() {
    return this.current != null;
  }

  // ------------------------------------------------------------ screens

  show(name, data = {}) {
    this.sampler?.stop();
    this.sampler = null;
    this.current = name;
    this.data = data;
    const html = this[`html_${name}`](data);
    this.root.innerHTML = `<section class="screen screen-${name}" data-screen="${name}">${html}</section>`;
    this.root.classList.add('open');
    this.afterRender(name, data);
    const first = this.root.querySelector('[autofocus]') || this.focusables()[0];
    if (first) first.focus({ preventScroll: true });
  }

  hide() {
    this.sampler?.stop();
    this.current = null;
    this.root.innerHTML = '';
    this.root.classList.remove('open');
  }

  html_menu() {
    const daily = this.app.dailyInfo();
    const rows = COURSES.map((c, i) => {
      const open = courseUnlocked(i, store);
      return `<tr><th>${esc(c.name)}</th><td>${open ? `${courseThimbles(c, store)} / 27` : 'locked'}</td></tr>`;
    }).join('');
    return `
      <div class="envelope" role="dialog" aria-label="Main menu">
        <div class="env-flap" aria-hidden="true"></div>
        <header class="env-head"><span>Pattern No. 2711</span><span>One size · all ages</span></header>
        <h1 class="env-title">Felt Links</h1>
        <p class="env-sub chalk">crazy golf for the craft table</p>
        <div class="env-window"><canvas class="env-art" width="420" height="170" aria-hidden="true"></canvas></div>
        <ol class="env-views">
          <li><button data-act="courses" autofocus><b class="view">A</b><span>Play the courses<small>27 holes on 3 quilts</small></span></button></li>
          <li><button data-act="daily"><b class="view">B</b><span>Today's hole<small>${esc(daily.name)} · par ${daily.par}${daily.best ? ` · your best ${daily.best}` : ''}</small></span></button></li>
          <li><button data-act="help"><b class="view">C</b><span>How to play<small>the instruction sheet</small></span></button></li>
          <li><button data-act="settings"><b class="view">D</b><span>The button tin<small>sound, controls, comfort</small></span></button></li>
        </ol>
        <table class="env-chart"><caption>Thimbles collected</caption>${rows}</table>
        <footer class="env-foot">“Felt Links” is a working title · everything is made in code</footer>
      </div>`;
  }

  html_courses(data) {
    const sw = COURSES.map((c, i) => {
      const open = courseUnlocked(i, store);
      const n = courseThimbles(c, store);
      const need = i > 0 ? Math.max(0, UNLOCK_THIMBLES - courseThimbles(COURSES[i - 1], store)) : 0;
      return `
        <button class="swatch swatch-${c.theme}${open ? '' : ' locked'}${data.course === i ? ' chosen' : ''}" data-act="course" data-course="${i}" aria-label="${esc(c.name)}${open ? `, ${n} of 27 thimbles` : ', locked'}">
          <span class="swatch-cloth"></span>
          <span class="pin" aria-hidden="true"></span>
          <span class="tag"><b>${esc(c.name)}</b><small>${esc(c.blurb)}</small>
          <em>${open ? `${thimbleSvg(true, 15)} ${n} / 27` : `Collect ${need} more thimble${need === 1 ? '' : 's'} in ${esc(COURSES[i - 1].name)}`}</em></span>
          ${open ? '' : '<span class="tissue chalk" aria-hidden="true">still in the post</span>'}
        </button>`;
    }).join('');
    let strip = '';
    if (data.course != null) {
      const c = COURSES[data.course];
      const btns = c.holes
        .map((h, j) => {
          const rec = store.hole(h.id);
          return `<li><button class="hole-btn" data-act="hole" data-hole="${j}" aria-label="Hole ${j + 1}, ${esc(h.name)}, par ${h.par}${rec ? `, best ${rec.best}` : ''}">
            <span class="sewn-button">${j + 1}</span>
            <span class="hole-name">${esc(h.name)}</span>
            <span class="hole-meta">par ${h.par}${rec ? ` · best ${rec.best}` : ''}</span>
            <span class="hole-th">${thimbleRow(rec?.thimbles || 0, 13)}</span></button></li>`;
        })
        .join('');
      strip = `<div class="holes-strip"><h3 class="chalk">${esc(c.name)}: pick a hole (the round carries on from there)</h3><ol>${btns}</ol></div>`;
    }
    return `
      <div class="corkboard" role="dialog" aria-label="Course select">
        <h2 class="cork-title">Pick a fabric</h2>
        <div class="swatches">${sw}</div>
        ${strip}
        <button class="paper-tag back" data-act="menu">← back to the pattern</button>
      </div>`;
  }

  html_card(d) {
    const actions = d.actions
      .map((a, i) => `<button class="${i === 0 ? 'stitch-btn primary' : 'stitch-btn'}" data-act="${a.act}"${i === 0 ? ' autofocus' : ''}>${esc(a.label)}</button>`)
      .join('');
    return `
      <div class="sampler-frame" role="dialog" aria-label="Scorecard">
        <div class="sampler-slot"></div>
        <p class="card-note chalk">${esc(d.note || '')}</p>
        <div class="card-thimbles" aria-label="${d.thimbles ?? 0} thimbles">${d.thimbles != null ? thimbleRow(d.thimbles, 30) : ''}</div>
        <div class="card-actions">${actions}</div>
      </div>`;
  }

  html_pause(d) {
    return `
      <div class="patch-card" role="dialog" aria-label="Paused">
        <h2>Taking a breather</h2>
        <p class="chalk">${esc(d.where || '')}</p>
        <button class="stitch-btn primary" data-act="resume" autofocus>Carry on</button>
        <button class="stitch-btn" data-act="restart">Restart this hole</button>
        <button class="stitch-btn" data-act="scorecard">Scorecard</button>
        <button class="stitch-btn" data-act="settings">The button tin</button>
        ${d.canSkip ? '<button class="stitch-btn" data-act="skip">Pick up and move on (no thimbles)</button>' : ''}
        <button class="stitch-btn" data-act="quit">${d.daily ? 'Back to the pattern' : 'Back to the corkboard'}</button>
      </div>`;
  }

  html_help() {
    const chip = (cls, name, txt) => `<li><span class="chip chip-${cls}"></span><b>${name}</b> ${txt}</li>`;
    return `
      <div class="instructions" role="dialog" aria-label="How to play">
        <h2>Instructions</h2>
        <p class="chalk">read through before cutting out</p>
        <ol class="steps">
          <li><b>Aim.</b> Press anywhere and pull back, like a catapult. The running stitch shows where the pompom will set off; the further you pull, the harder the shot. Let go to shoot. Pull back to the start to cancel.</li>
          <li><b>Keys.</b> ← → aim, ↑ ↓ power, Space shoots. Hold Shift for fine aim. <b>Pad:</b> left stick aims, squeeze the right trigger for power and let go to shoot (or press A).</li>
          <li><b>Sink it</b> in the buttonhole in as few strokes as you can. At or under par earns 3 thimbles, one over earns 2, finishing earns 1. 15 thimbles in a course opens the next one.</li>
          <li><b>Take your time.</b> There is no timer. O (or the ⤢ button) shows the whole hole, R restarts it, Esc or P pauses, M mutes.</li>
        </ol>
        <h3>Fabrics</h3>
        <ul class="legend">
          ${chip('felt', 'Felt', 'grippy: the pompom stops quickly and holds slopes.')}
          ${chip('satin', 'Satin', 'slippery (marked ~): it barely stops.')}
          ${chip('cord', 'Corduroy', 'bumpy (marked |||): little hops as you roll.')}
          ${chip('denim', 'Denim', 'fast (marked ///): it keeps rolling.')}
        </ul>
        <h3>Notions and hazards</h3>
        <ul class="legend">
          <li><span class="sym">≈</span><b>Felt water</b> wave-stitched blue, with a wave tag: ball out, +1 stroke, back where you were.</li>
          <li><span class="sym">▲</span><b>Pincushions</b> spiky, with a hatched triangle tag: pins snag wool, +1 stroke.</li>
          <li><span class="sym">⟲</span><b>Buttons</b> spin and carry you; <b>zips</b> run like conveyors (the arrow shows which way); <b>ribbons</b> sag under you.</li>
          <li><span class="sym">↕</span><b>The needle</b> bobs: wait for it to lift. <b>Cotton reels</b> roll as you cross. <b>Loose threads</b> snag and slow you. <b>Hand fans</b> blow you along.</li>
        </ul>
        <button class="stitch-btn primary" data-act="back" autofocus>Got it</button>
      </div>`;
  }

  html_settings() {
    const s = store.settings();
    const b = store.bindings();
    const slider = (key, label) =>
      `<label class="ribbon-slider"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${s[key]}" data-setting="${key}" aria-label="${label} volume" /></label>`;
    const toggle = (key, label, hint) =>
      `<button class="tin-toggle" data-act="toggle" data-key="${key}" aria-pressed="${!!s[key]}"><span class="loose-button" aria-hidden="true"></span><span>${label}<small>${hint}</small></span></button>`;
    const keys = Object.keys(ACTION_LABELS)
      .map((k) => `<li><span>${ACTION_LABELS[k]}</span><button class="key-btn" data-act="rebind" data-action="${k}" aria-label="${ACTION_LABELS[k]}: ${keyName(b[k])}. Press to change">${esc(keyName(b[k]))}</button></li>`)
      .join('');
    return `
      <div class="tin" role="dialog" aria-label="Settings">
        <div class="tin-rim"><h2>The Button Tin</h2></div>
        <div class="tin-inner">
          <div class="tin-section">
            ${slider('music', 'Music')}
            ${slider('sfx', 'Effects')}
          </div>
          <div class="tin-section toggles">
            ${toggle('muted', 'Mute everything', 'M at any time')}
            ${toggle('reducedMotion', 'Reduce motion', 'no wobbles, sweeps or waving')}
            ${toggle('largeText', 'Larger text', 'for menus and labels')}
            ${toggle('aimGuide', 'Stitch guide', 'show the shot as a running stitch')}
            ${toggle('hazardPatterns', 'Hazard markings', 'shapes and patterns on hazards and fabrics')}
          </div>
          <div class="tin-section">
            <h3>Keys <small class="chalk">press a key to change it</small></h3>
            <ul class="keys">${keys}</ul>
            <p class="small">Esc always pauses. Gamepad: stick aims, right trigger sets power, A shoots, Y restarts, X overview, Start pauses, Back mutes.</p>
            <button class="stitch-btn" data-act="resetKeys">Reset keys</button>
            <button class="stitch-btn danger" data-act="resetProgress">Unpick all progress</button>
          </div>
          <button class="stitch-btn primary" data-act="back">Close the tin</button>
        </div>
      </div>`;
  }

  afterRender(name, data) {
    if (name === 'menu') this.drawEnvelopeArt($('.env-art', this.root));
    if (name === 'card') {
      const s = buildSampler(data.title, data.rows, data.highlight, {
        footer: data.footer,
        maxWidth: Math.min(window.innerWidth - 48, 460),
        maxHeight: Math.min(window.innerHeight * 0.58, 600),
        label: data.label,
      });
      $('.sampler-slot', this.root).appendChild(s.canvas);
      this.sampler = s;
      s.play(() => audio.play('stitch'), store.settings().reducedMotion);
      if (data.thimbles != null) {
        [...this.root.querySelectorAll('.card-thimbles .thimble')].forEach((el, i) => {
          el.style.animationDelay = `${0.5 + i * 0.25}s`;
          if (i < data.thimbles) setTimeout(() => this.current === 'card' && audio.play('thimble', { i }), 500 + i * 250);
        });
      }
    }
    if (name === 'settings') {
      this.root.querySelectorAll('input[type=range]').forEach((inp) =>
        inp.addEventListener('input', () => {
          store.setSetting(inp.dataset.setting, Number(inp.value));
          this.app.applySettings();
        }),
      );
    }
  }

  drawEnvelopeArt(c) {
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = 420;
    const H = 170;
    c.width = W * dpr;
    c.height = H * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.fillStyle = pattern(g, 'gingham', PAL.rose, 64);
    g.fillRect(0, 0, W, H);
    const hills = [[-10, 140], [60, 120], [150, 92], [230, 110], [320, 96], [430, 120], [430, 180], [-10, 180]];
    g.save();
    g.shadowColor = 'rgba(40,20,8,0.35)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 3;
    g.fillStyle = pattern(g, 'felt', PAL.sage, 96);
    tracePath(g, hills, true);
    g.fill();
    g.restore();
    stitchLine(g, offsetPolyline(hills.slice(0, 6), 8), PAL.thread, 1.8, [6, 5]);
    // Flag on the right hill.
    g.strokeStyle = '#b8bec4';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(330, 98);
    g.lineTo(330, 40);
    g.stroke();
    g.fillStyle = pattern(g, 'felt', PAL.rust, 64);
    g.beginPath();
    g.moveTo(330, 42);
    g.lineTo(370, 54);
    g.lineTo(330, 66);
    g.fill();
    // A dotted shot arc and the pompom.
    g.strokeStyle = PAL.cocoa;
    g.setLineDash([6, 6]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(84, 104);
    g.quadraticCurveTo(200, -10, 318, 92);
    g.stroke();
    g.setLineDash([]);
    const spr = pompomSprite(26, PAL.mustard);
    g.drawImage(spr, 84 - spr.width / 4, 104 - spr.height / 4 - 4, spr.width / 2, spr.height / 2);
    g.font = '22px "Gochi Hand", cursive';
    g.fillStyle = PAL.chalk;
    g.fillText('view A', 18, 30);
  }

  // ------------------------------------------------------------ actions

  handle(act, el) {
    const app = this.app;
    switch (act) {
      case 'courses':
        return this.show('courses', {});
      case 'menu':
        return this.show('menu');
      case 'daily':
        return app.startDaily();
      case 'help':
        this.returnTo = this.current === 'help' ? this.returnTo : this.current;
        return this.show('help');
      case 'settings':
        this.returnTo = this.current;
        this.returnData = this.data;
        return this.show('settings');
      case 'back':
        return this.back();
      case 'course': {
        const i = Number(el.dataset.course);
        if (!courseUnlocked(i, store)) {
          this.toast(`Collect ${UNLOCK_THIMBLES} thimbles in ${COURSES[i - 1].name} to open this one`);
          return undefined;
        }
        this.show('courses', { course: i });
        const first = this.root.querySelector('.hole-btn');
        first?.focus({ preventScroll: true });
        first?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return undefined;
      }
      case 'hole':
        return app.startRound(this.data.course, Number(el.dataset.hole));
      case 'resume':
        return app.resume();
      case 'restart':
        return app.restartHole();
      case 'scorecard':
        return app.showRoundCard();
      case 'skip':
        return app.skipHole();
      case 'quit':
        return app.quit();
      case 'next':
        return app.nextHole();
      case 'replay':
        return app.replayHole();
      case 'toggle': {
        const k = el.dataset.key;
        const v = !store.settings()[k];
        store.setSetting(k, v);
        el.setAttribute('aria-pressed', String(v));
        app.applySettings();
        return undefined;
      }
      case 'rebind': {
        const action = el.dataset.action;
        el.textContent = 'press a key…';
        el.classList.add('waiting');
        app.input.captureNext((code) => {
          if (code) store.setBinding(action, code);
          this.show('settings');
          this.root.querySelector(`[data-action="${action}"]`)?.focus();
        });
        return undefined;
      }
      case 'resetKeys':
        store.resetBindings();
        return this.show('settings');
      case 'resetProgress':
        if (el.dataset.armed) {
          store.resetProgress();
          this.toast('All unpicked. A fresh start.');
          return this.show('settings');
        }
        el.dataset.armed = '1';
        el.textContent = 'Press again to unpick everything';
        return undefined;
      default:
        return undefined;
    }
  }

  back() {
    const cur = this.current;
    if (cur === 'settings' || cur === 'help') {
      const to = this.returnTo;
      this.returnTo = null;
      if (to === 'pause') return this.app.pause(true);
      if (to === 'courses') return this.show('courses', this.returnData || {});
      return this.show('menu');
    }
    if (cur === 'courses') {
      if (this.data.course != null) return this.show('courses', {});
      return this.show('menu');
    }
    if (cur === 'pause') return this.app.resume();
    if (cur === 'card') {
      const first = this.root.querySelector('.card-actions [data-act]');
      return first?.click();
    }
    return undefined;
  }

  // ------------------------------------------------------------ focus navigation

  focusables() {
    return [...this.root.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((el) => el.offsetParent !== null);
  }

  nav(dir) {
    const els = this.focusables();
    if (!els.length) return;
    const cur = document.activeElement;
    if (cur && cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      const v = Math.max(0, Math.min(1, Number(cur.value) + (dir === 'left' ? -0.05 : 0.05)));
      cur.value = v;
      cur.dispatchEvent(new Event('input'));
      return;
    }
    if (!els.includes(cur)) return els[0].focus();
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const qx = q.left + q.width / 2;
      const qy = q.top + q.height / 2;
      const dx = qx - cx;
      const dy = qy - cy;
      const along = { up: -dy, down: dy, left: -dx, right: dx }[dir];
      if (along <= 4) continue;
      const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best) {
      // Wrap within the list order.
      const i = els.indexOf(cur);
      best = dir === 'up' || dir === 'left' ? els[(i - 1 + els.length) % els.length] : els[(i + 1) % els.length];
    }
    best.focus();
    best.scrollIntoView({ block: 'nearest' });
    audio.play('stitch');
  }

  activate() {
    const el = document.activeElement;
    if (el && this.root.contains(el) && el.tagName === 'BUTTON') el.click();
  }

  // ------------------------------------------------------------ HUD

  buildHud() {
    this.hudEl.innerHTML = `
      <div class="hud-label" aria-label="Hole">
        <span class="hl-course"></span>
        <b class="hl-name"></b>
        <span class="hl-line"><span class="hl-par"></span><span class="hl-strokes"></span></span>
        <span class="tally" aria-hidden="true"></span>
      </div>
      <div class="hud-buttons">
        <button class="hud-btn" data-hud="overview" aria-label="Look at the whole hole (O)" title="Whole hole (O)"><span>⤢</span></button>
        <button class="hud-btn" data-hud="restart" aria-label="Restart hole (R)" title="Restart (R)"><span>↺</span></button>
        <button class="hud-btn" data-hud="pause" aria-label="Pause (Esc)" title="Pause (Esc)"><span>Ⅱ</span></button>
      </div>
      <div class="hud-tape hidden" aria-hidden="true"><div class="tape-body"><div class="tape-fill"></div><div class="tape-ticks"></div></div><span class="tape-read chalk"></span></div>
      <div class="hud-intro hidden"></div>
      <p class="hud-hint chalk hidden"></p>`;
    this.hudEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hud]');
      if (!b) return;
      audio.play('click');
      this.app.hudAction(b.dataset.hud);
    });
    this.hudEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  hudShow(hole, courseName) {
    this.hudEl.classList.remove('hidden');
    $('.hl-course', this.hudEl).textContent = hole.daily ? `Daily hole · ${hole.daily}` : `${courseName} · hole ${hole.number}`;
    $('.hl-name', this.hudEl).textContent = hole.name;
    $('.hl-par', this.hudEl).textContent = `Par ${hole.par}`;
    this.hudStrokes(0, hole.par);
  }

  hudHide() {
    this.hudEl.classList.add('hidden');
  }

  hudStrokes(n, par) {
    $('.hl-strokes', this.hudEl).textContent = `Stroke ${n}`;
    const t = $('.tally', this.hudEl);
    t.innerHTML = Array.from({ length: Math.max(n, par) }, (_, i) => `<i class="${i < n ? (i < par ? 'x' : 'x over') : 'dot'}"></i>`).join('');
  }

  hudPower(p) {
    const tape = $('.hud-tape', this.hudEl);
    if (p == null) {
      tape.classList.add('hidden');
      return;
    }
    tape.classList.remove('hidden');
    $('.tape-fill', tape).style.width = `${Math.round(p * 100)}%`;
    $('.tape-read', tape).textContent = `${Math.round(p * 36)} in`;
  }

  hudIntro(hole, text) {
    const el = $('.hud-intro', this.hudEl);
    el.innerHTML = `<span class="hi-num">${hole.daily ? '★' : hole.number}</span><span><b>${esc(hole.name)}</b><small>Par ${hole.par}${text ? ` · ${esc(text)}` : ''}</small></span>`;
    el.classList.remove('hidden', 'gone');
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => el.classList.add('gone'), 2600);
  }

  hudHint(text) {
    const el = $('.hud-hint', this.hudEl);
    if (!text) return el.classList.add('hidden');
    el.textContent = text;
    el.classList.remove('hidden');
  }

  toast(text, ms = 2200) {
    const el = this.toastEl;
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('hidden');
    }, ms);
  }
}

export const ui = new UI();
