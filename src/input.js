// Mouse and touch drag-to-aim, keyboard aiming (rebindable), gamepad (stick aims,
// trigger sets power) and menu navigation for all three.

import { store } from './storage.js';

export const ACTION_LABELS = {
  aimLeft: 'Aim up / left',
  aimRight: 'Aim down / right',
  powerUp: 'More power',
  powerDown: 'Less power',
  shoot: 'Shoot',
  fine: 'Fine aim (hold)',
  overview: 'Look at whole hole',
  restart: 'Restart hole',
  pause: 'Pause',
  mute: 'Mute',
};

export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R Shift', Escape: 'Esc', Enter: 'Enter', ControlLeft: 'Ctrl', AltLeft: 'Alt', Tab: 'Tab' };
  return map[code] || code;
}

export class Input {
  /**
   * h = {
   *   mode(): 'play' | 'menu' | 'none', canAim(): bool,
   *   shoot(angle, power), aimChanged(), action(name), nav(dir), activate(), back()
   * }
   */
  constructor(canvas, h) {
    this.canvas = canvas;
    this.h = h;
    this.aim = { angle: Math.PI / 4, power: 0.5 };
    this.showAim = false; // keyboard or pad aim is visible
    this.drag = null;
    this.held = new Set();
    this.capture = null;
    this.pad = { prev: [], rtPeak: 0, navT: 0, lastDir: null };
    this.lastDevice = 'mouse';
    this.bind();
  }

  setAimTowards(angle) {
    this.aim.angle = angle;
    this.aim.power = 0.45;
  }

  get maxDrag() {
    const m = Math.min(window.innerWidth, window.innerHeight);
    return Math.max(130, Math.min(320, m * 0.38));
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.h.mode() !== 'play' || !this.h.canAim()) return;
      if (e.button === 2) return;
      c.setPointerCapture?.(e.pointerId);
      this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, power: 0, angle: this.aim.angle };
      this.lastDevice = e.pointerType === 'touch' ? 'touch' : 'mouse';
      this.showAim = false;
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      const vx = d.x0 - d.x;
      const vy = d.y0 - d.y;
      const dist = Math.hypot(vx, vy);
      d.power = Math.min(1, dist / this.maxDrag);
      if (dist > 6) d.angle = Math.atan2(-vy, vx);
      this.h.aimChanged();
    });
    const end = (e, cancel) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (!cancel && d.power > 0.04 && this.h.canAim()) {
        this.aim.angle = d.angle;
        this.aim.power = d.power;
        this.h.shoot(d.angle, d.power);
      }
      this.h.aimChanged();
    };
    c.addEventListener('pointerup', (e) => end(e, false));
    c.addEventListener('pointercancel', (e) => end(e, true));
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.drag) {
        this.drag = null;
        this.h.aimChanged();
      }
    });

    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  /** Next key pressed is handed to cb (for rebinding). */
  captureNext(cb) {
    this.capture = cb;
  }

  keydown(e) {
    this.lastDevice = 'keyboard';
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    const b = store.bindings();
    const mode = this.h.mode();
    if (e.code === b.mute) {
      this.h.action('mute');
      e.preventDefault();
      return;
    }
    if (mode === 'menu') {
      const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (dirs[e.code]) {
        e.preventDefault();
        this.h.nav(dirs[e.code]);
      } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        // Let real buttons handle their own Enter; Space would scroll.
        e.preventDefault();
        this.h.activate();
      } else if (e.code === 'Escape' || e.code === 'Backspace' || e.code === b.pause) {
        e.preventDefault();
        this.h.back();
      }
      return;
    }
    if (mode !== 'play') return;
    if (e.code === 'Escape' || e.code === b.pause) {
      e.preventDefault();
      if (this.drag) {
        this.drag = null;
        this.h.aimChanged();
        return;
      }
      this.h.action('pause');
      return;
    }
    if (e.code === b.restart) return this.h.action('restart');
    if (e.code === b.overview) return this.h.action('overview');
    if (e.code === b.shoot || e.code === 'Enter') {
      e.preventDefault();
      if (!e.repeat && this.h.canAim()) {
        this.showAim = false;
        this.h.shoot(this.aim.angle, this.aim.power);
      }
      return;
    }
    if ([b.aimLeft, b.aimRight, b.powerUp, b.powerDown, b.fine].includes(e.code)) {
      e.preventDefault();
      this.held.add(e.code);
      this.showAim = true;
      this.h.aimChanged();
    }
  }

  /** Called every frame: held keys and the gamepad. */
  update(dt) {
    const b = store.bindings();
    const mode = this.h.mode();
    if (mode === 'play' && this.h.canAim()) {
      const fine = this.held.has(b.fine) || this.held.has('ShiftRight');
      const rot = (fine ? 0.25 : 1.1) * dt;
      const pw = (fine ? 0.12 : 0.55) * dt;
      let changed = false;
      if (this.held.has(b.aimLeft)) (this.aim.angle += rot), (changed = true);
      if (this.held.has(b.aimRight)) (this.aim.angle -= rot), (changed = true);
      if (this.held.has(b.powerUp)) (this.aim.power = Math.min(1, this.aim.power + pw)), (changed = true);
      if (this.held.has(b.powerDown)) (this.aim.power = Math.max(0.05, this.aim.power - pw)), (changed = true);
      if (changed) this.h.aimChanged();
    }
    this.pollPad(dt);
  }

  pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return;
    const btn = (i) => !!gp.buttons[i]?.pressed;
    const val = (i) => gp.buttons[i]?.value || 0;
    const prev = this.pad.prev;
    const pressed = (i) => btn(i) && !prev[i];
    const ax = gp.axes[0] || 0;
    const ay = gp.axes[1] || 0;
    const mode = this.h.mode();
    const any = gp.buttons.some((x) => x.pressed) || Math.hypot(ax, ay) > 0.35;
    if (any) this.lastDevice = 'gamepad';

    if (pressed(8)) this.h.action('mute');
    if (mode === 'menu') {
      let dir = null;
      if (btn(12) || ay < -0.6) dir = 'up';
      else if (btn(13) || ay > 0.6) dir = 'down';
      else if (btn(14) || ax < -0.6) dir = 'left';
      else if (btn(15) || ax > 0.6) dir = 'right';
      this.pad.navT -= dt;
      if (dir && (dir !== this.pad.lastDir || this.pad.navT <= 0)) {
        this.h.nav(dir);
        this.pad.navT = dir === this.pad.lastDir ? 0.14 : 0.38;
      }
      this.pad.lastDir = dir;
      if (pressed(0)) this.h.activate();
      if (pressed(1) || pressed(9)) this.h.back();
    } else if (mode === 'play') {
      if (pressed(9)) this.h.action('pause');
      if (pressed(3)) this.h.action('restart');
      if (pressed(2)) this.h.action('overview');
      if (this.h.canAim()) {
        let changed = false;
        if (Math.hypot(ax, ay) > 0.35) {
          this.aim.angle = Math.atan2(-ay, ax);
          changed = true;
        }
        const rot = dt * 0.35;
        if (btn(14) || btn(4)) (this.aim.angle += rot), (changed = true);
        if (btn(15) || btn(5)) (this.aim.angle -= rot), (changed = true);
        if (btn(12)) (this.aim.power = Math.min(1, this.aim.power + dt * 0.4)), (changed = true);
        if (btn(13)) (this.aim.power = Math.max(0.05, this.aim.power - dt * 0.4)), (changed = true);
        // Right trigger: squeeze to set power, let go to shoot (like a slingshot).
        const rt = val(7);
        if (rt > 0.08) {
          this.aim.power = Math.max(0.05, rt);
          this.pad.rtPeak = Math.max(this.pad.rtPeak * 0.995, rt);
          changed = true;
        } else if (this.pad.rtPeak > 0.15) {
          const p = this.pad.rtPeak;
          this.pad.rtPeak = 0;
          this.aim.power = p;
          this.showAim = false;
          this.h.shoot(this.aim.angle, p);
        } else this.pad.rtPeak = 0;
        if (pressed(0)) {
          this.showAim = false;
          this.h.shoot(this.aim.angle, this.aim.power);
        } else if (changed) {
          this.showAim = true;
          this.h.aimChanged();
        }
      }
    }
    this.pad.prev = gp.buttons.map((x) => x.pressed);
  }

  /** The aim to draw this frame, or null. */
  currentAim() {
    if (this.drag && this.drag.power > 0.02) return { angle: this.drag.angle, power: this.drag.power, pull: [this.drag.x, this.drag.y] };
    if (this.showAim) return { angle: this.aim.angle, power: this.aim.power, pull: null };
    return null;
  }
}
