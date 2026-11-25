// The daily hole: built from a seed that is a hash of the local date, so
// everyone on the same day gets the same hole. A tee pad, two or three
// pieces from the patch library, then a green with the cup.

import { makeRng, dailySeed, dateKey } from '../rng.js';
import { hasRobustAce } from '../solver.js';

const THEMES = ['meadow', 'seaside', 'attic'];
const NAMES_A = ['Tacking', 'Darning', 'Basting', 'Hemming', 'Smocking', 'Quilting', 'Gathering', 'Ruching', 'Couching', 'Feather'];
const NAMES_B = ['Lane', 'Run', 'Loop', 'Fold', 'Seam', 'Pocket', 'Gusset', 'Placket', 'Yoke', 'Selvedge'];

/**
 * Each piece appends ground and objects starting at (x, y) and returns the
 * new end point plus a difficulty weight used for par.
 */
const PIECES = {
  hill(r, x, y, g, o) {
    const w = r.int(360, 460);
    const hgt = r.int(50, 110);
    const surf = r.pick(['felt', 'corduroy', 'felt']);
    g.push([x + 60, y, surf], [x + w / 2 - 40, y - hgt], [x + w / 2 + 40, y - hgt], [x + w - 60, y, 'felt']);
    return { x: x + w, y, d: 0.4 };
  },
  pond(r, x, y, g, o) {
    const w = r.int(300, 400);
    g.push([x + 20, y], [x + 50, y + 100], [x + w - 50, y + 100], [x + w - 20, y]);
    o.push({ type: 'water', x0: x + 30, x1: x + w - 30, y: y + 35 });
    return { x: x + w, y, d: 1 };
  },
  satin(r, x, y, g, o) {
    const w = r.int(360, 440);
    const drop = r.int(50, 90);
    const ny = Math.min(560, y + drop);
    g.push([x + 40, y, 'satin'], [x + w - 40, ny], [x + w, ny, 'felt']);
    return { x: x + w, y: ny, d: 0.4 };
  },
  denim(r, x, y, g, o) {
    const w = r.int(380, 480);
    const ny = Math.max(420, y - r.int(20, 50));
    g.push([x + 40, y, 'denim'], [x + w / 2, y + 30], [x + w - 40, ny], [x + w, ny, 'felt']);
    return { x: x + w, y: ny, d: 0.3 };
  },
  pins(r, x, y, g, o) {
    const w = r.int(300, 380);
    g.push([x + w, y]);
    o.push({ type: 'pins', x: x + w / 2, y: y - 18, r: 18 });
    return { x: x + w, y, d: 0.5 };
  },
  band(r, x, y, g, o) {
    const w = r.int(340, 420);
    const hgt = r.int(70, 110);
    const ny = y - hgt;
    g.push([x + w / 2, y], [x + w / 2, ny], [x + w, ny]);
    o.push({ type: 'band', a: [x + w / 2 - 110, y], b: [x + w / 2 - 8, y - hgt * 0.62] });
    return { x: x + w, y: ny, d: 0.5 };
  },
  buttons(r, x, y, g, o) {
    const n = r.int(3, 4);
    const w = 120 + n * 160;
    g.push([x + 20, y], [x + 40, y + 140], [x + w - 40, y + 140], [x + w - 20, y]);
    o.push({ type: 'water', x0: x + 30, x1: x + w - 30, y: y + 50 });
    for (let i = 0; i < n; i++) o.push({ type: 'button', x: x + 130 + i * 160, y: y + 50 - i * 6, r: 58, spin: i === n - 1 ? 3.6 : 3.2 });
    return { x: x + w, y, d: 1 };
  },
  ribbon(r, x, y, g, o) {
    const w = r.int(380, 480);
    g.push([x, y], [x + 25, y + 150], [x + w - 25, y + 150], [x + w, y]);
    o.push({ type: 'water', x0: x + 10, x1: x + w - 10, y: y + 70 });
    o.push({ type: 'ribbon', a: [x, y], b: [x + w, y], sag: 50 });
    return { x: x + w, y, d: 0.6 };
  },
  needle(r, x, y, g, o) {
    const w = r.int(320, 380);
    g.push([x + w, y]);
    o.push({ type: 'needle', x: x + w / 2, top: y - 170, high: y - 128, low: y - 3, period: r.pick([2, 2.2, 2.4]) });
    return { x: x + w, y, d: 0.5 };
  },
  reels(r, x, y, g, o) {
    const n = r.int(5, 7);
    const w = 40 + n * 64;
    g.push([x, y], [x + 20, y + 130], [x + w - 20, y + 130], [x + w, y]);
    o.push({ type: 'pins', x: x + w / 2, y: y + 112, r: 18 });
    for (let i = 0; i < n; i++) o.push({ type: 'reel', x: x + 52 + i * 64, y: y + 26, r: 28 });
    return { x: x + w, y, d: 0.5 };
  },
  thread(r, x, y, g, o) {
    const w = r.int(300, 360);
    g.push([x + w, y]);
    o.push({ type: 'thread', x: x + w / 2, y: 40, len: y - 40 - 22 });
    return { x: x + w, y, d: 0.4 };
  },
  fan(r, x, y, g, o) {
    const w = r.int(560, 640);
    g.push([x + 20, y], [x + 50, y + 140], [x + w - 50, y + 140], [x + w - 20, y]);
    o.push({ type: 'water', x0: x + 30, x1: x + w - 30, y: y + 65 });
    o.push({ type: 'fan', x: x + 160, y: y + 55, dir: -0.95, len: 540, width: 300, strength: 840, period: 2.6 });
    return { x: x + w, y, d: 1 };
  },
};

const KEYS = Object.keys(PIECES);

const settled = new Map();

/**
 * The hole for a date. With settlePar, a par-3+ hole that has a hole-in-one a
 * person could repeat drops to par 2 (the same rule npm run check:holes uses).
 * That search takes a moment, so the result is cached per date.
 */
export function dailyHole(key = dateKey(), { settlePar = false, knownPar = null } = {}) {
  const r = makeRng(dailySeed(key));
  const theme = THEMES[r.int(0, 2)];
  let y = r.int(460, 520);
  const ground = [[0, y]];
  const objs = [];
  let x = 320;
  ground.push([x, y]);
  const count = r.int(2, 3);
  let d = 0;
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let k;
    do k = r.pick(KEYS);
    while (used.has(k));
    used.add(k);
    const res = PIECES[k](r, x, y, ground, objs);
    x = res.x;
    y = res.y;
    d += res.d;
  }
  const green = r.int(420, 520);
  const cup = x + green - r.int(130, 190);
  ground.push([x + green, y]);
  const w = x + green;
  // Tuned against npm run check:holes over many dates.
  const par = d >= 2.4 ? 4 : d < 0.9 ? 2 : 3;
  const hole = {
    id: `daily-${key}`,
    daily: key,
    name: `${r.pick(NAMES_A)} ${r.pick(NAMES_B)}`,
    par,
    w,
    tee: [150, ground[0][1] - 30],
    cup,
    theme,
    ground,
    objs,
  };
  if (knownPar) hole.par = knownPar;
  else if (settlePar && hole.par > 2) {
    if (!settled.has(key)) settled.set(key, hasRobustAce(hole) ? 2 : hole.par);
    hole.par = settled.get(key);
  }
  return hole;
}
