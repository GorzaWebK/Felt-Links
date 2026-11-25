// A tiny 2D physics module for one soft ball: circle against static polylines,
// moving segments and spinning circles. No DOM; runs the same in Node and the browser.
// Units are world units (the ball's radius is 10) and seconds; y points down.

export const GRAVITY = 980;
export const BALL_R = 10;
export const DT = 1 / 240; // fixed sub-step
export const MAX_SHOT = 1000; // launch speed at full power

/**
 * Surfaces. e = bounciness, roll = rolling drag (world units/s^2, also sets the
 * steepest slope the ball can sit still on), grip = tangential loss on impact,
 * bumps = ridge spacing for corduroy.
 */
export const SURFACES = {
  felt: { e: 0.3, roll: 250, grip: 0.32 },
  satin: { e: 0.26, roll: 22, grip: 0.04 },
  corduroy: { e: 0.3, roll: 150, grip: 0.22, bumps: 15 },
  denim: { e: 0.38, roll: 48, grip: 0.08 },
  wood: { e: 0.42, roll: 110, grip: 0.12 },
  tin: { e: 0.48, roll: 70, grip: 0.08 },
  ribbon: { e: 0.18, roll: 130, grip: 0.25 },
  button: { e: 0.32, roll: 160, grip: 0.45 },
  zip: { e: 0.25, roll: 300, grip: 0.55 },
  band: { e: 1.0, roll: 60, grip: 0.05 },
  needle: { e: 0.4, roll: 80, grip: 0.1 },
};

export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return t;
}

/**
 * Tests the ball against segment a-b with an optional thickness.
 * Returns null or { nx, ny, pen, t } with the normal pointing toward the ball.
 */
export function circleVsSegment(ball, ax, ay, bx, by, thick = 0) {
  const t = closestOnSegment(ball.x, ball.y, ax, ay, bx, by);
  const cx = ax + (bx - ax) * t;
  const cy = ay + (by - ay) * t;
  let dx = ball.x - cx;
  let dy = ball.y - cy;
  const rr = ball.r + thick;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return null;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Dead centre on the line: push out along the segment's left normal.
    const lx = by - ay;
    const ly = -(bx - ax);
    const l = Math.hypot(lx, ly) || 1;
    dx = lx / l;
    dy = ly / l;
    d = 0;
    return { nx: dx, ny: dy, pen: rr, t };
  }
  return { nx: dx / d, ny: dy / d, pen: rr - d, t };
}

export function circleVsCircle(ball, cx, cy, R) {
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const rr = ball.r + R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1e-6;
  return { nx: dx / d, ny: dy / d, pen: rr - d };
}

/**
 * Resolves one contact. svx/svy is the velocity of the surface at the contact
 * point (zero for static ground). Returns the normal impact speed and the change
 * in the ball's tangential velocity (used to spin free reels).
 */
export function resolveContact(ball, c, surf, svx = 0, svy = 0, dt = DT) {
  const { nx, ny } = c;
  ball.x += nx * c.pen;
  ball.y += ny * c.pen;
  const rvx = ball.vx - svx;
  const rvy = ball.vy - svy;
  let vn = rvx * nx + rvy * ny;
  const tx = -ny;
  const ty = nx;
  let vt = rvx * tx + rvy * ty;
  const vt0 = vt;
  let impact = 0;
  if (vn < 0) {
    impact = -vn;
    // Soft wool: tiny impacts just settle instead of jittering.
    const e = impact < 55 ? 0 : surf.e;
    vn = -vn * e;
    vt *= 1 - surf.grip * Math.min(1, impact / 420);
  }
  const dec = surf.roll * dt;
  if (Math.abs(vt) <= dec) vt = 0;
  else vt -= Math.sign(vt) * dec;
  ball.vx = svx + nx * vn + tx * vt;
  ball.vy = svy + ny * vn + ty * vt;
  ball.contact = true;
  ball.cnx = nx;
  ball.cny = ny;
  ball.cvt = vt;
  return { impact, dvt: vt - vt0, tx, ty };
}

/** Uniform grid over static segments so each sub-step only tests nearby lines. */
export class SegmentGrid {
  constructor(segs, cell = 64) {
    this.cell = cell;
    this.map = new Map();
    this.segs = segs;
    segs.forEach((s, i) => {
      const pad = (s.thick || 0) + BALL_R + 2;
      const x0 = Math.floor((Math.min(s.ax, s.bx) - pad) / cell);
      const x1 = Math.floor((Math.max(s.ax, s.bx) + pad) / cell);
      const y0 = Math.floor((Math.min(s.ay, s.by) - pad) / cell);
      const y1 = Math.floor((Math.max(s.ay, s.by) + pad) / cell);
      for (let gx = x0; gx <= x1; gx++)
        for (let gy = y0; gy <= y1; gy++) {
          const k = gx * 73856093 ^ gy * 19349663;
          let list = this.map.get(k);
          if (!list) this.map.set(k, (list = []));
          list.push(i);
        }
    });
    this.stamp = new Uint32Array(segs.length);
    this.frame = 0;
  }
  /** Calls fn(seg) once for each segment near (x, y). */
  near(x, y, fn) {
    const gx = Math.floor(x / this.cell);
    const gy = Math.floor(y / this.cell);
    const list = this.map.get(gx * 73856093 ^ gy * 19349663);
    if (!list) return;
    this.frame = (this.frame + 1) >>> 0;
    for (const i of list) {
      if (this.stamp[i] === this.frame) continue;
      this.stamp[i] = this.frame;
      fn(this.segs[i]);
    }
  }
}
