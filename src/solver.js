// A robot golfer that plays a hole with the real simulation. Used by
// tools/check-holes.mjs to prove holes are completable with a fair par, and by
// the daily hole to settle its par. No DOM.
//
// It searches a grid of shots (angle x power, plus waiting for the needle or fan
// where a hole has them), keeps the most promising resting places, and goes
// stroke by stroke. A finish only counts if a person could repeat it: the shot
// must still go in with the aim 1 degree off or the power 2.5% off.

import { buildWorld, restore, settle, shoot, snapshot, step } from './sim.js';

function grid(quick) {
  const ANG = quick ? 4 : 2.5;
  const POW = quick ? 0.06 : 0.04;
  const angles = [];
  for (let a = -12; a <= 192; a += ANG) angles.push((a * Math.PI) / 180);
  const powers = [];
  for (let p = 0.06; p <= 1.0001; p += POW) powers.push(Math.min(1, p));
  return { angles, powers };
}

function trial(world, snap, wait, ang, pow) {
  restore(world, snap);
  world.events.length = 0;
  if (wait > 0) {
    const end = world.t + wait;
    while (world.t < end) step(world);
    world.events.length = 0;
  }
  shoot(world, ang, pow);
  const end = world.t + 26;
  while (world.t < end) {
    step(world);
    if (world.events.length > 256) world.events.length = 0;
    if (world.ball.state !== 'moving') break;
  }
  return world.ball.state;
}

function robustAmong(world, snap, sinking) {
  const dA = (1 * Math.PI) / 180;
  const dP = 0.025;
  for (const s of sinking.slice(0, 24)) {
    let ok = 0;
    for (const [i, j] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]])
      if (trial(world, snap, s.wait, s.ang + i * dA, s.pow + j * dP) === 'sunk') ok++;
    if (ok >= 6) return true;
  }
  return false;
}

function prepare(hole) {
  const world = buildWorld(hole);
  const s0 = settle(world, 10);
  const timed = (hole.objs || []).some((o) => o.type === 'needle' || o.type === 'fan');
  return { world, ok: s0 === 'rest', waits: timed ? [0, 0.55, 1.1, 1.65] : [0] };
}

/**
 * True if the hole has a hole-in-one a person could repeat. Stops at the first
 * one found. It samples exactly the shots solveHole's first stroke does, so the
 * daily par and npm run check:holes can never disagree.
 */
export function hasRobustAce(hole) {
  const { world, ok, waits } = prepare(hole);
  if (!ok) return false;
  const { angles, powers } = grid(false);
  const snap = snapshot(world);
  for (const wait of waits)
    for (const ang of angles)
      for (const pow of powers) if (trial(world, snap, wait, ang, pow) === 'sunk' && robustAmong(world, snap, [{ wait, ang, pow }])) return true;
  return false;
}

/**
 * Plays the hole up to maxDepth strokes. Returns
 * { best, any, hio, sims } (best = fewest robust strokes, or null) or { error }.
 */
export function solveHole(hole, { quick = false, maxDepth = hole.par + 1 } = {}) {
  const { world, ok, waits } = prepare(hole);
  if (!ok) return { error: 'ball does not settle on the tee' };
  const { angles, powers } = grid(quick);
  const cup = world.cup;
  let frontier = [{ snap: snapshot(world) }];
  let anyDepth = null;
  let hioShots = 0;
  let hioTotal = 0;
  let sims = 0;
  const BEAM = quick ? 6 : 10;

  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = new Map();
    for (const node of frontier) {
      const sinking = [];
      for (const wait of waits)
        for (const ang of angles)
          for (const pow of powers) {
            const st = trial(world, node.snap, wait, ang, pow);
            sims++;
            if (depth === 1) hioTotal++;
            if (st === 'sunk') {
              if (depth === 1) hioShots++;
              sinking.push({ wait, ang, pow });
            } else if (st === 'rest') {
              const b = world.ball;
              const key = `${Math.round(b.x / 28)},${Math.round(b.y / 28)}`;
              const dist = Math.hypot(b.x - cup.x, (b.y - cup.y) * 1.6);
              const old = next.get(key);
              if (!old || old.dist > dist) next.set(key, { dist, x: b.x, snap: snapshot(world) });
            }
          }
      if (sinking.length && anyDepth == null) anyDepth = depth;
      if (robustAmong(world, node.snap, sinking)) return { best: depth, any: anyDepth, hio: hioTotal ? hioShots / hioTotal : 0, sims };
    }
    // Beam: the closest resting places, plus a spread along the hole for variety.
    const all = [...next.values()].sort((a, b) => a.dist - b.dist);
    const picked = all.slice(0, Math.ceil(BEAM * 0.7));
    const rest = all.slice(picked.length).sort((a, b) => b.x - a.x);
    const extra = BEAM - picked.length;
    for (let i = 0; i < extra && rest.length; i++) picked.push(rest[Math.floor((i * rest.length) / extra)]);
    frontier = picked.filter(Boolean);
    if (!frontier.length) break;
  }
  return { best: null, any: anyDepth, hio: hioTotal ? hioShots / hioTotal : 0, sims };
}
