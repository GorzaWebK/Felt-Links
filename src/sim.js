// One hole as a running simulation: the ground, the craft obstacles, the hazards,
// the buttonhole cup and the pompom. Pure logic: used by the game and by
// tools/check-holes.mjs, so whatever the checker proves is what the player gets.

import {
  BALL_R,
  DT,
  GRAVITY,
  MAX_SHOT,
  SURFACES,
  SegmentGrid,
  circleVsCircle,
  circleVsSegment,
  closestOnSegment,
  resolveContact,
} from './physics.js';

export const CUP_HALF = 17; // buttonhole is 34 wide; the ball is 20 across
export const CUP_DEPTH = 30;
const MOVE_TIMEOUT = 30; // seconds before a ball that never settles is called

function segment(ax, ay, bx, by, surf, extra = {}) {
  return { ax, ay, bx, by, surf, ...extra };
}

/** Ground points with the cup notch spliced in at cupX. */
function withCup(points, cupX) {
  const out = [];
  let cup = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    out.push(p);
    const q = points[i + 1];
    if (!cup && q && p[0] <= cupX - CUP_HALF && q[0] >= cupX + CUP_HALF) {
      const slope = (q[1] - p[1]) / (q[0] - p[0]);
      if (Math.abs(slope) > 0.06) throw new Error(`cup at ${cupX} is on a slope (${slope.toFixed(2)})`);
      const y = p[1] + slope * (cupX - p[0]);
      const s = p[2];
      out.push(
        [cupX - CUP_HALF, y, 'felt', 'lip'],
        [cupX - CUP_HALF, y + CUP_DEPTH, 'felt', 'cup'],
        [cupX + CUP_HALF, y + CUP_DEPTH, 'felt', 'cup'],
        [cupX + CUP_HALF, y, s, 'lip'],
      );
      cup = { x: cupX, y, hw: CUP_HALF, depth: CUP_DEPTH };
    }
  }
  if (!cup) throw new Error(`cup at ${cupX} is not on the ground line`);
  return { points: out, cup };
}

/** Carries each point's surface forward to the following points that don't name one. */
function fillSurfaces(points, fallback) {
  let s = fallback;
  return points.map((p) => {
    if (p[2]) s = p[2];
    return [p[0], p[1], s, p[3]];
  });
}

function polySegments(pts, surf, closed, extra) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const s = (Array.isArray(surf) ? surf[i] : surf) || 'felt';
    out.push(segment(a[0], a[1], b[0], b[1], s, extra));
  }
  return out;
}

function copyState(s) {
  const o = {};
  for (const k in s) {
    const v = s[k];
    o[k] = v && typeof v === 'object' ? v.slice() : v;
  }
  return o;
}

// ---------------------------------------------------------------- bodies

const RIBBON_N = 14;

function makeBody(def, world) {
  const b = { ...def, s: {} };
  switch (def.type) {
    case 'button':
      b.s.ang = 0;
      break;
    case 'reel':
      b.s.ang = 0;
      b.s.w = def.motor || 0;
      break;
    case 'band':
      b.s.vib = 0;
      b.s.hitU = 0.5;
      break;
    case 'ribbon': {
      b.sag = def.sag ?? 42;
      b.s.k = 0; // how far it is sagging (0..1)
      b.s.u = 0.5;
      b.s.touch = 0;
      b.s.off = new Array(RIBBON_N + 1).fill(0);
      b.s.prev = new Array(RIBBON_N + 1).fill(0);
      break;
    }
    case 'needle':
      b.period = def.period ?? 2.2;
      b.phase = def.phase ?? 0;
      // The machine head is solid: a block above the needle bar.
      world.segs.push(
        ...polySegments(
          [
            [def.x - 34, def.top - 70],
            [def.x + 26, def.top - 70],
            [def.x + 26, def.top],
            [def.x - 34, def.top],
          ],
          'tin',
          true,
          { kind: 'machine' },
        ),
      );
      break;
    case 'thread':
      b.s.snag = 0;
      break;
    case 'zip': {
      const dx = def.b[0] - def.a[0];
      const dy = def.b[1] - def.a[1];
      const l = Math.hypot(dx, dy);
      world.segs.push(
        segment(def.a[0], def.a[1], def.b[0], def.b[1], 'zip', {
          sv: [(dx / l) * def.speed, (dy / l) * def.speed],
          kind: 'zip',
          thick: 2,
        }),
      );
      break;
    }
    default:
      break;
  }
  return b;
}

function needleTip(b, t) {
  const c = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / b.period + b.phase));
  return b.high + (b.low - b.high) * c;
}

function needleSpeed(b, t) {
  const w = (2 * Math.PI) / b.period;
  return (b.low - b.high) * 0.5 * Math.sin(w * t + 2 * Math.PI * b.phase) * w;
}

function ribbonPoint(b, i) {
  const f = i / RIBBON_N;
  return [b.a[0] + (b.b[0] - b.a[0]) * f, b.a[1] + (b.b[1] - b.a[1]) * f + b.s.off[i]];
}

function updateBody(b, world, dt) {
  const t = world.t;
  const s = b.s;
  switch (b.type) {
    case 'button':
      s.ang += b.spin * dt;
      break;
    case 'reel':
      if (b.motor) s.w = b.motor;
      else s.w *= Math.exp(-dt * 0.7);
      s.ang += s.w * dt;
      break;
    case 'band':
      s.vib *= Math.exp(-dt * 7);
      break;
    case 'ribbon': {
      const target = s.touch > 0 ? 1 : 0;
      s.k += (target - s.k) * (1 - Math.exp(-dt * (target ? 7 : 3)));
      if (s.touch > 0) s.touch -= dt;
      const u = Math.min(0.92, Math.max(0.08, s.u));
      const depth = b.sag * s.k * (0.4 + 2.4 * u * (1 - u));
      for (let i = 0; i <= RIBBON_N; i++) {
        const f = i / RIBBON_N;
        const tent = f < u ? f / u : (1 - f) / (1 - u);
        const smooth = tent * tent * (3 - 2 * tent);
        s.prev[i] = s.off[i];
        s.off[i] = 8 * 4 * f * (1 - f) + depth * smooth;
      }
      break;
    }
    default:
      break;
  }
  void t;
}

function collideBody(b, ball, world, ev) {
  const s = b.s;
  switch (b.type) {
    case 'button': {
      const c = circleVsCircle(ball, b.x, b.y, b.r);
      if (!c) return;
      const svx = -b.spin * b.r * c.ny;
      const svy = b.spin * b.r * c.nx;
      const r = resolveContact(ball, c, SURFACES.button, svx, svy);
      ball.surf = 'button';
      if (Math.abs(b.spin) > 0.01) ball.supportMoving = true;
      if (r.impact > 60) ev.push({ type: 'plip', speed: r.impact, x: ball.x, y: ball.y });
      return;
    }
    case 'reel': {
      const c = circleVsCircle(ball, b.x, b.y, b.r);
      if (!c) return;
      const svx = -s.w * b.r * c.ny;
      const svy = s.w * b.r * c.nx;
      const r = resolveContact(ball, c, SURFACES.wood, svx, svy);
      if (!b.motor) s.w -= (r.dvt * 0.55) / b.r;
      ball.surf = 'wood';
      if (Math.abs(s.w * b.r) > 4) ball.supportMoving = true;
      if (r.impact > 60) ev.push({ type: 'plip', speed: r.impact, x: ball.x, y: ball.y, wood: true });
      return;
    }
    case 'band': {
      const [ax, ay] = b.a;
      const [bx, by] = b.b;
      const c = circleVsSegment(ball, ax, ay, bx, by, 4);
      if (!c) return;
      ball.x += c.nx * c.pen;
      ball.y += c.ny * c.pen;
      const vn = ball.vx * c.nx + ball.vy * c.ny;
      if (vn < -30) {
        const out = Math.min(900, Math.max(-vn * 1.02, b.kick ?? 380));
        ball.vx += c.nx * (out - vn);
        ball.vy += c.ny * (out - vn);
        ball.vx *= 0.97;
        ball.vy *= 0.97;
        s.vib = Math.min(1, -vn / 500 + 0.35);
        s.hitU = c.t;
        ev.push({ type: 'twang', speed: -vn, x: ball.x, y: ball.y });
      } else {
        resolveContact(ball, { ...c, pen: 0 }, SURFACES.band);
        ball.surf = 'band';
      }
      return;
    }
    case 'ribbon': {
      let touched = false;
      for (let i = 0; i < RIBBON_N; i++) {
        const [ax, ay] = ribbonPoint(b, i);
        const [bx, by] = ribbonPoint(b, i + 1);
        const c = circleVsSegment(ball, ax, ay, bx, by, 3);
        if (!c) continue;
        const v0 = (s.off[i] - s.prev[i]) / DT;
        const v1 = (s.off[i + 1] - s.prev[i + 1]) / DT;
        const svy = v0 + (v1 - v0) * c.t;
        resolveContact(ball, c, SURFACES.ribbon, 0, svy);
        ball.surf = 'ribbon';
        if (c.ny < -0.3) touched = true;
      }
      if (touched) {
        s.touch = 0.12;
        ball.supportMoving = s.k < 0.97;
        const ub = closestOnSegment(ball.x, ball.y, b.a[0], b.a[1], b.b[0], b.b[1]);
        // The dip trails a little behind the ball, so crossing a ribbon costs speed.
        s.u += (ub - s.u) * (1 - Math.exp(-DT * 5));
      }
      return;
    }
    case 'needle': {
      const tip = needleTip(b, world.t);
      const c = circleVsSegment(ball, b.x, b.top, b.x, tip, 3.5);
      if (!c) return;
      if (c.ny > 0.55) {
        // Never pin the ball under the needle: slide it off to one side.
        const side = Math.sign(ball.x - b.x) || 1;
        c.nx = side * 0.8;
        c.ny = 0.6;
      }
      const r = resolveContact(ball, c, SURFACES.needle, 0, needleSpeed(b, world.t));
      if (r.impact > 60) ev.push({ type: 'tink', speed: r.impact, x: ball.x, y: ball.y });
      return;
    }
    case 'thread': {
      const c = circleVsSegment(ball, b.x, b.y, b.x, b.y + b.len, 3);
      if (c && !s.snag) {
        s.snag = 1;
        ball.vx *= 0.38;
        ball.vy *= 0.38;
        ev.push({ type: 'snag', x: ball.x, y: ball.y });
      } else if (!c && s.snag) {
        const t = closestOnSegment(ball.x, ball.y, b.x, b.y, b.x, b.y + b.len);
        const d = Math.hypot(ball.x - b.x, ball.y - (b.y + b.len * t));
        if (d > ball.r + 16) s.snag = 0;
      }
      return;
    }
    default:
      return;
  }
}

function windAt(f, x, y, t) {
  const dx = Math.cos(f.dir);
  const dy = Math.sin(f.dir);
  const px = x - f.x;
  const py = y - f.y;
  const along = px * dx + py * dy;
  if (along < 0 || along > f.len) return null;
  const across = Math.abs(-px * dy + py * dx);
  const half = (f.width / 2) * (0.55 + 0.45 * (along / f.len));
  if (across > half) return null;
  const k = f.strength * (1 - 0.45 * (along / f.len)) * (0.72 + 0.28 * Math.sin((2 * Math.PI * t) / (f.period ?? 2.4)));
  return [dx * k, dy * k];
}

// ---------------------------------------------------------------- world

export function buildWorld(hole) {
  const world = {
    hole,
    w: hole.w,
    h: hole.h ?? 640,
    t: 0,
    segs: [],
    bodies: [],
    water: [],
    pins: [],
    fans: [],
    events: [],
    strokes: 0,
  };
  const base = fillSurfaces(hole.ground, hole.surface || 'felt');
  const { points, cup } = withCup(base, hole.cup);
  world.ground = points;
  world.cup = cup;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    world.segs.push(segment(a[0], a[1], b[0], b[1], a[2], { kind: b[3] === 'cup' || a[3] === 'cup' ? 'cup' : 'ground' }));
  }
  // Quilt binding at both ends of the table, unless the hole opts out.
  const top = -600;
  const first = points[0];
  const last = points[points.length - 1];
  if (hole.walls !== false && hole.walls !== 'right') world.segs.push(segment(first[0], first[1], first[0], top, 'felt', { kind: 'wall' }));
  if (hole.walls !== false && hole.walls !== 'left') world.segs.push(segment(last[0], top, last[0], last[1], 'felt', { kind: 'wall' }));

  world.solids = (hole.solids || []).map((sd) => {
    const segs = polySegments(sd.pts, sd.surf || 'felt', sd.closed !== false, { kind: 'solid' });
    world.segs.push(...segs);
    return sd;
  });

  for (const o of hole.objs || []) {
    if (o.type === 'water') world.water.push(o);
    else if (o.type === 'pins') world.pins.push(o);
    else if (o.type === 'fan') world.fans.push(o);
    else world.bodies.push(makeBody(o, world));
  }

  world.grid = new SegmentGrid(world.segs);
  const [tx, ty] = hole.tee;
  world.ball = {
    x: tx,
    y: ty,
    vx: 0,
    vy: 0,
    r: BALL_R,
    state: 'moving', // drops onto the tee
    rt: 0,
    mt: 0,
    spin: 0,
    contact: false,
    surf: 'felt',
    lastRest: [tx, ty],
    ridge: 0,
  };
  return world;
}

export function shoot(world, angle, power) {
  const b = world.ball;
  const v = MAX_SHOT * Math.max(0, Math.min(1, power));
  b.lastRest = [b.x, b.y];
  b.vx = Math.cos(angle) * v;
  b.vy = -Math.sin(angle) * v;
  b.state = 'moving';
  b.rt = 0;
  b.mt = 0;
  world.strokes++;
}

/** Puts the ball back where it last sat still (after water, pins or leaving the table). */
export function resetBall(world) {
  const b = world.ball;
  b.x = b.lastRest[0];
  b.y = b.lastRest[1] - 2;
  b.vx = b.vy = 0;
  b.state = 'moving';
  b.rt = 0;
  b.mt = 0;
  for (const body of world.bodies) if (body.type === 'thread') body.s.snag = 0;
}

export function snapshot(world) {
  return {
    t: world.t,
    strokes: world.strokes,
    ball: { ...world.ball, lastRest: world.ball.lastRest.slice() },
    bodies: world.bodies.map((b) => copyState(b.s)),
  };
}

export function restore(world, snap) {
  world.t = snap.t;
  world.strokes = snap.strokes;
  Object.assign(world.ball, snap.ball, { lastRest: snap.ball.lastRest.slice() });
  world.bodies.forEach((b, i) => (b.s = copyState(snap.bodies[i])));
}

/** Advances the world by one fixed sub-step. Events are appended to world.events. */
export function step(world) {
  const dt = DT;
  world.t += dt;
  const ev = world.events;
  for (const b of world.bodies) updateBody(b, world, dt);

  const ball = world.ball;
  if (ball.state !== 'moving' && ball.state !== 'rest') return;

  let ax = 0;
  let ay = GRAVITY;
  let wind = 0;
  for (const f of world.fans) {
    const w = windAt(f, ball.x, ball.y, world.t);
    if (w) {
      ax += w[0];
      ay += w[1];
      wind = Math.max(wind, f.strength);
    }
  }
  ball.vx += ax * dt;
  ball.vy += ay * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  const wasContact = ball.contact;
  ball.contact = false;
  ball.supportMoving = false;
  for (let iter = 0; iter < 2; iter++) {
    world.grid.near(ball.x, ball.y, (sg) => {
      const c = circleVsSegment(ball, sg.ax, sg.ay, sg.bx, sg.by, sg.thick || 0);
      if (!c) return;
      const surf = SURFACES[sg.surf] || SURFACES.felt;
      const r = resolveContact(ball, c, surf, sg.sv ? sg.sv[0] : 0, sg.sv ? sg.sv[1] : 0);
      if (c.ny < -0.3) ball.surf = sg.surf;
      if (sg.sv) {
        ball.supportMoving = true;
        if (r.impact > 50) ev.push({ type: 'zip', speed: r.impact, x: ball.x, y: ball.y });
      }
      if (r.impact > 45 && iter === 0)
        ev.push({ type: 'hit', surf: sg.surf, speed: r.impact, x: ball.x, y: ball.y, nx: c.nx, ny: c.ny });
    });
    for (const b of world.bodies) collideBody(b, ball, world, ev);
  }

  // Corduroy ridges give a rolling ball little hops.
  if (ball.contact && ball.surf === 'corduroy') {
    const ridge = Math.floor(ball.x / SURFACES.corduroy.bumps);
    if (ridge !== ball.ridge) {
      const sp = Math.abs(ball.cvt || 0);
      if (sp > 45) {
        const kick = Math.min(70, sp * 0.13);
        ball.vx += ball.cnx * kick;
        ball.vy += ball.cny * kick;
        ev.push({ type: 'ridge', speed: sp, x: ball.x, y: ball.y });
      }
      ball.ridge = ridge;
    }
  }

  if (ball.contact) ball.spin += ((ball.cvt || 0) / ball.r) * dt;
  else ball.spin += (ball.vx / ball.r) * dt * 0.3;
  if (!wasContact && ball.contact) ball.landed = world.t;

  // Hazards.
  for (const w of world.water) {
    if (ball.x > w.x0 && ball.x < w.x1 && ball.y > w.y + 3) return out(world, 'water');
  }
  for (const p of world.pins) {
    if (Math.hypot(ball.x - p.x, ball.y - p.y) < p.r + ball.r * 0.6) return out(world, 'pins');
  }
  if (ball.x < -80 || ball.x > world.w + 80 || ball.y > world.h + 120) return out(world, 'table');

  // The cup.
  const cup = world.cup;
  if (Math.abs(ball.x - cup.x) < cup.hw && ball.y > cup.y + ball.r * 0.45) {
    ball.state = 'sunk';
    ball.vx *= 0.2;
    ev.push({ type: 'sunk', x: ball.x, y: ball.y });
    return;
  }

  // Settling.
  const sp = Math.hypot(ball.vx, ball.vy);
  const holds = !wind || wind < (SURFACES[ball.surf]?.roll ?? 250) * 0.9;
  if (ball.contact && !ball.supportMoving && sp < 7 && holds) {
    ball.rt += dt;
    if (ball.state === 'rest' || ball.rt > 0.3) {
      if (ball.state !== 'rest') ev.push({ type: 'rest', x: ball.x, y: ball.y });
      ball.state = 'rest';
      ball.vx = ball.vy = 0;
    }
  } else {
    ball.rt = 0;
    if (ball.state === 'rest' && sp > 20) ball.state = 'moving';
  }
  if (ball.state === 'moving') {
    ball.mt += dt;
    if (ball.mt > MOVE_TIMEOUT) {
      if (ball.contact) {
        ball.state = 'rest';
        ball.vx = ball.vy = 0;
        ev.push({ type: 'rest', x: ball.x, y: ball.y });
      } else return out(world, 'stuck');
    }
  }
}

function out(world, reason) {
  world.ball.state = 'out';
  world.events.push({ type: 'out', reason, x: world.ball.x, y: world.ball.y });
}

/** Runs until the ball rests, sinks or goes out (or maxTime passes). */
export function settle(world, maxTime = 32) {
  const end = world.t + maxTime;
  while (world.t < end) {
    step(world);
    const s = world.ball.state;
    if (s !== 'moving') return s;
  }
  return world.ball.state;
}

export { needleTip, ribbonPoint, windAt, RIBBON_N };
