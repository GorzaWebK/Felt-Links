// Canvas 2D renderer: a side-on felt diorama on a craft table in warm light.
// The still parts of a hole (quilt backdrop, ground, platforms, notes) are drawn
// once into an offscreen layer; each frame copies it and draws what moves.

import { BALL_R, GRAVITY, MAX_SHOT } from './physics.js';
import { needleTip, ribbonPoint, RIBBON_N } from './sim.js';
import {
  PAL,
  THEMES,
  fabricTile,
  makeCanvas,
  offsetPolyline,
  pattern,
  pinkedPoints,
  pompomSprite,
  rgba,
  shade,
  stitchLine,
  tracePath,
} from './art.js';
import { mulberry32 } from './rng.js';

const VIEW_TOP = -140; // how far above the hole the camera may look
const PAD = 260;
const BG_TOP = -520;

const SURF_LOOK = {
  satin: { kind: 'satin', color: PAL.rose },
  corduroy: { kind: 'corduroy', color: PAL.mustard },
  denim: { kind: 'denim', color: PAL.denim },
  wood: { kind: 'wood', color: PAL.wood },
};
const SPOOL_COLOURS = [PAL.rust, PAL.denim, PAL.mustard, PAL.sage, PAL.rose];
const BUTTON_COLOURS = [PAL.mustard, PAL.rose, PAL.denimLight, PAL.sage, PAL.rust];

function groundYAt(points, x) {
  let best = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if ((x >= a[0] && x <= b[0]) || (x >= b[0] && x <= a[0])) {
      if (a[0] === b[0]) continue;
      const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
      if (best == null || y < best) best = y;
    }
  }
  return best ?? 640;
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, s: 1 };
    this.camTarget = { x: 0, y: 0, s: 1 };
    this.particles = [];
    this.wobbles = [];
    this.threads = new Map();
    this.squash = 0;
    this.squashN = [0, -1];
    this.time = 0;
    this.overview = false;
    this.settings = {};
    this.layer = null;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    if (this.world) {
      this.camTarget.s = this.fitScale();
      if (!this.layer || Math.abs(this.layerScale / (this.fitScale() * dpr) - 1) > 0.3) this.buildLayer();
    }
  }

  fitScale() {
    const W = this.world.w;
    const H = this.world.h;
    if (this.overview) return Math.min(this.w / (W + 60), this.h / (H - VIEW_TOP + 40));
    let s = Math.min(this.h / 560, this.w / 760);
    // Keep the pompom big enough to see and grab on small screens.
    s = Math.max(s, 7.5 / BALL_R);
    return s;
  }

  setWorld(world, settings) {
    this.world = world;
    this.settings = settings;
    this.theme = THEMES[world.hole.theme] || THEMES.meadow;
    this.particles.length = 0;
    this.wobbles.length = 0;
    this.threads.clear();
    this.overview = false;
    this.camTarget.s = this.fitScale();
    this.cam.s = this.camTarget.s;
    this.cam.x = world.ball.x + 200;
    this.cam.y = world.h * 0.55;
    this.clampCam(this.cam);
    this.buildLayer();
  }

  setOverview(on) {
    this.overview = on;
    this.camTarget.s = this.fitScale();
  }

  // ------------------------------------------------------------ static layer

  buildLayer() {
    const world = this.world;
    const ls = Math.min(this.fitScale() * this.dpr, Math.sqrt(9e6 / ((world.w + PAD * 2) * (world.h - BG_TOP + 260))));
    this.layerScale = ls;
    const lw = (world.w + PAD * 2) * ls;
    const lh = (world.h - BG_TOP + 260) * ls;
    const c = makeCanvas(lw, lh);
    const g = c.getContext('2d');
    g.scale(ls, ls);
    g.translate(PAD, -BG_TOP);
    this.drawBackdrop(g);
    this.drawWaterBodies(g);
    this.drawGround(g);
    this.drawSolids(g);
    this.drawCup(g);
    this.drawStaticBits(g);
    this.drawNotes(g);
    this.layer = c;
  }

  drawBackdrop(g) {
    const world = this.world;
    const th = this.theme;
    const rnd = mulberry32(world.hole.id.length * 977 + world.w);
    const x0 = -PAD;
    const x1 = world.w + PAD;
    const y0 = BG_TOP;
    const y1 = world.h + 260;
    const S = 170;
    // Quilt blocks.
    for (let y = y0, row = 0; y < y1; y += S, row++) {
      for (let x = x0 - (row % 2) * (S / 2), col = 0; x < x1; x += S, col++) {
        const kind = th.skyPrints[(row * 3 + col * 5 + Math.floor(rnd() * 2)) % th.skyPrints.length];
        let colr = th.sky[Math.floor(rnd() * th.sky.length)];
        if (rnd() < 0.18) colr = th.skyTint[Math.floor(rnd() * th.skyTint.length)];
        g.fillStyle = g.createPattern(fabricTile(kind === 'plain' ? 'felt' : kind, colr, kind === 'wood' ? 128 : 96), 'repeat');
        g.fillRect(x, y, S, S);
        g.strokeStyle = 'rgba(80,55,30,0.12)';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, S - 2, S - 2);
        stitchLine(g, [[x + 8, y + 8], [x + S - 8, y + 8], [x + S - 8, y + S - 8], [x + 8, y + S - 8]], rgba(PAL.thread, 0.75), 1.6, [6, 6], true);
      }
    }
    // Afternoon light from the top left, shade to the bottom right.
    const grd = g.createLinearGradient(0, y0, world.w * 0.8, y1);
    grd.addColorStop(0, th.light);
    grd.addColorStop(0.55, 'rgba(255,240,210,0)');
    grd.addColorStop(1, 'rgba(70,40,20,0.22)');
    g.fillStyle = grd;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);

    const theme = world.hole.theme;
    if (theme === 'meadow') {
      this.feltSun(g, world.w * 0.78, 70, 60, PAL.mustard);
      for (let i = 0; i < 4; i++) this.feltCloud(g, 160 + i * (world.w / 3.2) + rnd() * 80, 40 + rnd() * 120, 0.8 + rnd() * 0.5);
    } else if (theme === 'seaside') {
      this.feltSun(g, world.w * 0.2, 60, 54, PAL.mustard);
      const lines = Math.ceil(world.w / 520);
      for (let i = 0; i < lines; i++) this.bunting(g, i * 520 - 40, -20 + (i % 2) * 18, (i + 1) * 520 + 40, -20 + ((i + 1) % 2) * 18, i);
    } else {
      // Attic: shelf brackets and a tape measure pinned along the top.
      this.tapeMeasure(g, -PAD, -60, world.w + PAD * 2);
    }
  }

  feltSun(g, x, y, r, colour) {
    g.save();
    g.shadowColor = 'rgba(60,35,10,0.25)';
    g.shadowBlur = 8;
    g.shadowOffsetX = 3;
    g.shadowOffsetY = 4;
    g.fillStyle = pattern(g, 'felt', colour, 96);
    g.beginPath();
    g.moveTo(...pinkedPoints(this.circlePts(x, y, r, 40), 9, true)[0]);
    for (const p of pinkedPoints(this.circlePts(x, y, r, 40), 9, true)) g.lineTo(p[0], p[1]);
    g.closePath();
    g.fill();
    g.restore();
    stitchLine(g, this.circlePts(x, y, r - 10, 36), PAL.thread, 2, [6, 5], true);
  }

  feltCloud(g, x, y, k) {
    const pts = [];
    const bumps = [[-60, 6, 30], [-26, -14, 38], [18, -18, 34], [54, 2, 28]];
    g.save();
    g.shadowColor = 'rgba(60,35,10,0.18)';
    g.shadowBlur = 6;
    g.shadowOffsetX = 2;
    g.shadowOffsetY = 3;
    g.fillStyle = pattern(g, 'felt', PAL.linen, 96);
    g.beginPath();
    for (const [bx, by, br] of bumps) {
      g.moveTo(x + (bx + br) * k, y + by * k);
      g.arc(x + bx * k, y + by * k, br * k, 0, Math.PI * 2);
    }
    g.rect(x - 60 * k, y, 114 * k, 24 * k);
    g.fill();
    g.restore();
    g.save();
    g.strokeStyle = rgba(PAL.cocoa, 0.35);
    g.setLineDash([5, 5]);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x - 64 * k, y + 18 * k);
    g.lineTo(x + 60 * k, y + 18 * k);
    g.stroke();
    g.restore();
    void pts;
  }

  bunting(g, x0, y0, x1, y1, seed) {
    const sag = 40;
    const at = (f) => [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + Math.sin(f * Math.PI) * sag];
    g.save();
    g.strokeStyle = PAL.cocoa;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const p = at(f);
      if (f === 0) g.moveTo(p[0], p[1]);
      else g.lineTo(p[0], p[1]);
    }
    g.stroke();
    const flags = 8;
    for (let i = 0; i < flags; i++) {
      const f0 = (i + 0.15) / flags;
      const f1 = (i + 0.85) / flags;
      const a = at(f0);
      const b = at(f1);
      const tip = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 46];
      const col = [PAL.rust, PAL.mustard, PAL.rose, PAL.denim, PAL.sage][(i + seed) % 5];
      g.shadowColor = 'rgba(40,25,10,0.25)';
      g.shadowBlur = 4;
      g.shadowOffsetY = 3;
      g.fillStyle = pattern(g, i % 2 ? 'felt' : 'gingham', col, 64);
      const tri = pinkedPoints([a, b, tip], 7, true);
      tracePath(g, tri, true);
      g.fill();
      g.shadowColor = 'transparent';
      stitchLine(g, offsetPolyline([a, b, tip], -5, true), PAL.thread, 1.2, [4, 4], true);
    }
    g.restore();
  }

  tapeMeasure(g, x, y, len) {
    g.save();
    g.shadowColor = 'rgba(40,25,10,0.3)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 4;
    g.fillStyle = '#e8c766';
    g.fillRect(x, y, len, 34);
    g.restore();
    g.fillStyle = PAL.cocoa;
    g.font = '600 13px Fredoka, sans-serif';
    for (let i = 0; i * 24 < len; i++) {
      const tx = x + i * 24;
      g.fillRect(tx, y, 1.5, i % 5 ? 9 : 16);
      if (i % 5 === 0) g.fillText(String(i / 5), tx + 4, y + 28);
    }
  }

  circlePts(x, y, r, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    return out;
  }

  drawWaterBodies(g) {
    for (const wtr of this.world.water) {
      g.fillStyle = pattern(g, 'felt', this.theme.water, 96);
      g.fillRect(wtr.x0 - 20, wtr.y, wtr.x1 - wtr.x0 + 40, 240);
      // Colour-blind-safe: water always carries a wave pattern, not just blue.
      g.save();
      g.beginPath();
      g.rect(wtr.x0 - 20, wtr.y + 8, wtr.x1 - wtr.x0 + 40, 240);
      g.clip();
      g.strokeStyle = rgba(PAL.denimLight, 0.7);
      g.lineWidth = 2;
      g.setLineDash([8, 6]);
      for (let y = wtr.y + 22; y < wtr.y + 240; y += 18) {
        g.beginPath();
        for (let x = wtr.x0 - 20; x <= wtr.x1 + 20; x += 6) {
          const yy = y + Math.sin(x / 18 + y) * 4;
          if (x === wtr.x0 - 20) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
      g.restore();
    }
  }

  drawGround(g) {
    const world = this.world;
    const th = this.theme;
    const pts = world.ground.map((p) => [p[0], p[1]]);
    const bottom = world.h + 260;
    const poly = [[-PAD, pts[0][1]], ...pts, [world.w + PAD, pts[pts.length - 1][1]], [world.w + PAD, bottom], [-PAD, bottom]];
    // Soft halo so the felt lifts off the quilt behind it.
    g.save();
    g.shadowColor = 'rgba(50,30,12,0.35)';
    g.shadowBlur = 14;
    g.shadowOffsetY = -2;
    g.fillStyle = pattern(g, 'felt', th.ground, 128);
    tracePath(g, poly, true);
    g.fill();
    g.restore();

    // Patchwork pieces, stitched together.
    g.save();
    tracePath(g, poly, true);
    g.clip();
    const rnd = mulberry32(world.w * 3 + pts.length);
    let x = -PAD;
    let lean = 0;
    const seams = [];
    while (x < world.w + PAD) {
      const w = 170 + rnd() * 170;
      const nextLean = (rnd() - 0.5) * 120;
      const colr = th.patches[Math.floor(rnd() * th.patches.length)];
      const piece = [[x + lean, -100], [x + w + nextLean, -100], [x + w - nextLean, bottom], [x - lean, bottom]];
      g.fillStyle = pattern(g, rnd() < 0.15 ? 'corduroy' : 'felt', colr, 128);
      tracePath(g, piece, true);
      g.fill();
      seams.push([[x + w + nextLean, -100], [x + w - nextLean, bottom]]);
      // A few horizontal seams for the quilt look.
      if (rnd() < 0.6) {
        const sy = 560 + rnd() * 120;
        seams.push([[x + lean, sy], [x + w + nextLean, sy + (rnd() - 0.5) * 30]]);
      }
      x += w;
      lean = nextLean;
    }
    for (const s of seams) {
      g.strokeStyle = 'rgba(40,25,10,0.2)';
      g.lineWidth = 3;
      tracePath(g, s);
      g.stroke();
      stitchLine(g, offsetPolyline(s, 6), rgba(th.stitch, 0.8), 1.6, [6, 6]);
    }
    // Ground darkens lower down, like a fold in the cloth.
    const deep = g.createLinearGradient(0, 380, 0, bottom);
    deep.addColorStop(0, 'rgba(0,0,0,0)');
    deep.addColorStop(1, 'rgba(40,20,8,0.35)');
    g.fillStyle = deep;
    g.fillRect(-PAD, -100, world.w + PAD * 2, bottom + 100);

    // The top band: each surface's fabric with a pinked lower edge.
    const runs = [];
    let cur = null;
    world.ground.forEach((p, i) => {
      if (i === world.ground.length - 1) {
        if (cur) cur.pts.push([p[0], p[1]]);
        return;
      }
      const s = p[2] || 'felt';
      if (!cur || cur.surf !== s) {
        if (cur) cur.pts.push([p[0], p[1]]);
        cur = { surf: s, pts: [[p[0], p[1]]] };
        runs.push(cur);
      } else cur.pts.push([p[0], p[1]]);
    });
    for (const run of runs) {
      if (run.pts.length < 2) continue;
      const look = SURF_LOOK[run.surf] || { kind: 'felt', color: shade(th.ground, 0.12) };
      const depth = run.surf === 'felt' ? 16 : 20;
      const lower = pinkedPoints(offsetPolyline(run.pts, depth), 8);
      const band = [...run.pts, ...lower.reverse()];
      g.save();
      g.shadowColor = 'rgba(40,20,8,0.35)';
      g.shadowBlur = 4;
      g.shadowOffsetY = 2;
      g.fillStyle = pattern(g, look.kind, look.color, look.kind === 'felt' ? 128 : 64);
      tracePath(g, band, true);
      g.fill();
      g.restore();
      stitchLine(g, offsetPolyline(run.pts, 7), th.stitch, 2, [7, 6]);
      if (this.settings.hazardPatterns && run.surf !== 'felt') {
        // Surface symbols: satin ~, corduroy ||, denim //
        g.save();
        g.fillStyle = rgba(PAL.cocoa, 0.55);
        g.font = '700 13px Fredoka, sans-serif';
        const sym = { satin: '~ ~', corduroy: '| | |', denim: '/ / /' }[run.surf] || '';
        for (let i = 0; i < run.pts.length - 1; i++) {
          const a = run.pts[i];
          const b = run.pts[i + 1];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let d = 60; d < len - 30; d += 160) {
            const f = d / len;
            g.save();
            g.translate(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + 40);
            g.fillText(sym, -10, 0);
            g.restore();
          }
        }
        g.restore();
      }
    }
    g.restore();
    // Highlight along the very top of the cloth.
    g.strokeStyle = 'rgba(255,250,235,0.35)';
    g.lineWidth = 1.5;
    tracePath(g, pts);
    g.stroke();
    // Quilt binding up both ends of the table: the walls the pompom bounces off.
    const hole = world.hole;
    const ends = [];
    if (hole.walls !== false && hole.walls !== 'right') ends.push([pts[0][0] - 26, pts[0][1]]);
    if (hole.walls !== false && hole.walls !== 'left') ends.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
    for (const [x, gy] of ends) {
      g.save();
      g.shadowColor = 'rgba(40,20,8,0.4)';
      g.shadowBlur = 10;
      g.fillStyle = pattern(g, 'gingham', PAL.rust, 64);
      g.fillRect(x, BG_TOP, 26, gy - BG_TOP + 260);
      g.restore();
      stitchLine(g, [[x + 6, BG_TOP], [x + 6, gy + 260]], PAL.thread, 1.6, [6, 5]);
      stitchLine(g, [[x + 20, BG_TOP], [x + 20, gy + 260]], PAL.thread, 1.6, [6, 5]);
    }
  }

  drawSolids(g) {
    const th = this.theme;
    for (const sd of this.world.solids) {
      const wood = sd.surf === 'wood' || sd.fill === 'wood';
      const colour = th.solid[sd.fill] || (wood ? PAL.wood : th.solid.mustard);
      const outline = wood ? sd.pts : pinkedPoints(sd.pts, 8, true);
      g.save();
      g.shadowColor = 'rgba(40,20,8,0.4)';
      g.shadowBlur = 10;
      g.shadowOffsetX = 5;
      g.shadowOffsetY = 7;
      g.fillStyle = pattern(g, wood ? 'wood' : 'felt', colour, 128);
      tracePath(g, outline, true);
      g.fill();
      g.restore();
      const inward = polyArea(sd.pts) > 0 ? 7 : -7;
      stitchLine(g, offsetPolyline(sd.pts, inward, true), wood ? rgba(PAL.cocoa, 0.5) : PAL.thread, 2, [7, 6], true);
      if (wood) {
        g.fillStyle = rgba(PAL.cocoa, 0.6);
        for (const p of offsetPolyline(sd.pts, inward * 1.3, true)) {
          g.beginPath();
          g.arc(p[0], p[1], 2.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  drawCup(g) {
    const cup = this.world.cup;
    const x0 = cup.x - cup.hw;
    g.fillStyle = '#3b2a1f';
    g.fillRect(x0, cup.y, cup.hw * 2, cup.depth);
    const grd = g.createLinearGradient(0, cup.y, 0, cup.y + cup.depth);
    grd.addColorStop(0, 'rgba(0,0,0,0.5)');
    grd.addColorStop(1, 'rgba(0,0,0,0.05)');
    g.fillStyle = grd;
    g.fillRect(x0, cup.y, cup.hw * 2, cup.depth);
    // Buttonhole stitch around the opening: dense little bars.
    g.strokeStyle = PAL.thread;
    g.lineWidth = 1.6;
    const bar = (x, y, dx, dy) => {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx, y + dy);
      g.stroke();
    };
    for (let y = cup.y; y <= cup.y + cup.depth; y += 3.2) {
      bar(x0 - 6, y, 6, 0);
      bar(cup.x + cup.hw, y, 6, 0);
    }
    for (let x = x0 - 6; x <= cup.x + cup.hw + 6; x += 3.2) bar(x, cup.y + cup.depth, 0, 6);
  }

  drawStaticBits(g) {
    const world = this.world;
    // Tee: a cross-stitch X.
    const [tx] = world.hole.tee;
    const ty = groundYAt(world.ground, tx);
    g.strokeStyle = PAL.thread;
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    for (const dx of [-14, 14]) {
      g.beginPath();
      g.moveTo(tx + dx - 5, ty + 9);
      g.lineTo(tx + dx + 5, ty + 17);
      g.moveTo(tx + dx + 5, ty + 9);
      g.lineTo(tx + dx - 5, ty + 17);
      g.stroke();
    }
    for (const b of world.bodies) {
      if (b.type === 'zip') {
        // Zip tape.
        const [ax, ay] = b.a;
        const [bx, by] = b.b;
        g.save();
        g.lineCap = 'butt';
        g.strokeStyle = pattern(g, 'denim', PAL.denimDeep, 64);
        g.lineWidth = 16;
        g.beginPath();
        g.moveTo(ax, ay + 6);
        g.lineTo(bx, by + 6);
        g.stroke();
        g.restore();
        stitchLine(g, [[ax, ay + 12], [bx, by + 12]], PAL.thread, 1.5, [5, 4]);
      }
    }
  }

  drawNotes(g) {
    const notes = this.world.hole.notes || [];
    for (const n of notes) {
      g.save();
      g.translate(n.x, n.y);
      g.rotate(-0.03);
      g.font = '26px "Gochi Hand", "Segoe Print", "Comic Sans MS", cursive';
      g.textAlign = 'center';
      // A little denim patch so the chalk reads on any quilt block.
      const tw = g.measureText(n.text).width + 28;
      const patch = [[-tw / 2, -26], [tw / 2, -26], [tw / 2, 12], [-tw / 2, 12]];
      g.save();
      g.shadowColor = 'rgba(40,20,8,0.3)';
      g.shadowBlur = 5;
      g.shadowOffsetY = 3;
      g.fillStyle = pattern(g, 'felt', PAL.denimDeep, 96);
      tracePath(g, pinkedPoints(patch, 7, true), true);
      g.fill();
      g.restore();
      stitchLine(g, offsetPolyline(patch, -5, true), rgba(PAL.thread, 0.6), 1.2, [4, 4], true);
      // Tailor's chalk: a few soft, slightly offset passes.
      for (let i = 0; i < 3; i++) {
        g.fillStyle = rgba(PAL.chalk, 0.35);
        g.fillText(n.text, (i - 1) * 0.8, (i % 2) * 0.8);
      }
      g.fillStyle = rgba(PAL.chalk, 0.75);
      g.fillText(n.text, 0, 0);
      g.restore();
    }
  }

  // ------------------------------------------------------------ camera

  clampCam(c) {
    const world = this.world;
    const vw = this.w / c.s;
    const vh = this.h / c.s;
    const minX = -30;
    const maxX = world.w + 30;
    if (vw >= maxX - minX) c.x = (minX + maxX) / 2;
    else c.x = Math.max(minX + vw / 2, Math.min(maxX - vw / 2, c.x));
    const minY = VIEW_TOP;
    const maxY = world.h + (this.overview ? 30 : 0);
    if (vh >= maxY - minY) {
      // Tall screens (phones held upright): follow the ball, showing extra felt
      // below the hole rather than a tower of quilt above it.
      const lowest = world.h + (this.overview ? 30 : 220);
      c.y = Math.min(c.y, lowest - vh / 2);
      c.y = Math.max(c.y, maxY - vh / 2);
    } else c.y = Math.max(minY + vh / 2, Math.min(maxY - vh / 2, c.y));
  }

  updateCamera(dt, focus) {
    const t = this.camTarget;
    t.s = this.fitScale();
    if (this.overview) {
      t.x = this.world.w / 2;
      t.y = this.world.h / 2;
    } else {
      t.x = focus.x;
      t.y = focus.y;
    }
    this.clampCam(t);
    const k = this.settings.reducedMotion ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 3.2);
    this.cam.s += (t.s - this.cam.s) * Math.min(1, k * 1.4);
    this.cam.x += (t.x - this.cam.x) * k;
    this.cam.y += (t.y - this.cam.y) * k;
    this.clampCam(this.cam);
  }

  toWorld(sx, sy) {
    const c = this.cam;
    return [(sx - this.w / 2) / c.s + c.x, (sy - this.h / 2) / c.s + c.y];
  }

  toScreen(wx, wy) {
    const c = this.cam;
    return [(wx - c.x) * c.s + this.w / 2, (wy - c.y) * c.s + this.h / 2];
  }

  // ------------------------------------------------------------ effects

  onEvent(e) {
    const rm = this.settings.reducedMotion;
    switch (e.type) {
      case 'hit':
        if (e.speed > 90) {
          this.squash = Math.min(0.35, e.speed / 1400);
          this.squashN = [e.nx, e.ny];
          if (!rm) this.wobbles.push({ x: e.x, y: e.y + BALL_R, t: 0, amp: Math.min(7, e.speed / 90) });
          this.fluff(e.x, e.y + BALL_R * 0.6, Math.min(10, Math.round(e.speed / 80)));
        }
        break;
      case 'twang':
        this.fluff(e.x, e.y, 5);
        break;
      case 'snag':
        this.spray(e.x, e.y, 8, PAL.thread, 'thread');
        break;
      case 'out':
        if (e.reason === 'water') this.spray(e.x, e.y, 18, PAL.denimLight, 'splash');
        else if (e.reason === 'pins') this.spray(e.x, e.y, 10, PAL.mustard, 'fluff');
        break;
      case 'sunk':
        this.spray(e.x, e.y - 10, 14, PAL.mustard, 'pop');
        break;
      default:
        break;
    }
  }

  fluff(x, y, n) {
    if (this.settings.reducedMotion) n = Math.min(n, 2);
    for (let i = 0; i < n; i++)
      this.particles.push({ x, y, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 50, life: 1, max: 0.9 + Math.random() * 0.6, kind: 'fluff', c: PAL.mustard, a: Math.random() * 6 });
  }

  spray(x, y, n, c, kind) {
    if (this.settings.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 80 + Math.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, max: 0.6 + Math.random() * 0.5, kind, c, a: Math.random() * 6 });
    }
  }

  // ------------------------------------------------------------ frame

  /**
   * view = { aim: {angle, power} | null, pull: [sx, sy] | null, ballVisible, sinkT, transition, intro }
   */
  frame(dt, view) {
    this.time += dt;
    const g = this.ctx;
    const dpr = this.dpr;
    const world = this.world;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#cdb894';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!world) return;
    const c = this.cam;
    g.setTransform(dpr * c.s, 0, 0, dpr * c.s, dpr * (this.w / 2 - c.x * c.s), dpr * (this.h / 2 - c.y * c.s));

    // Static layer (drawn in world units).
    if (this.layer) {
      const ls = this.layerScale;
      g.imageSmoothingEnabled = true;
      g.drawImage(this.layer, 0, 0, this.layer.width, this.layer.height, -PAD, BG_TOP, this.layer.width / ls, this.layer.height / ls);
    }
    // Table edge beneath the hole.
    const t = this.time;
    this.drawWaterSurfaces(g, t);
    for (const b of world.bodies) this.drawBody(g, b, t, dt);
    for (const f of world.fans) this.drawFan(g, f, t, dt);
    for (const p of world.pins) this.drawPins(g, p);
    this.drawWobbles(g, dt);
    this.drawFlag(g, t, view.sinkT);
    if (view.aim) this.drawAim(g, view.aim, view.pull);
    if (view.ballVisible !== false) this.drawBall(g, dt, view);
    this.drawParticles(g, dt);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (view.intro != null) this.drawIntro(g, view.intro);
    if (view.transition != null) this.drawTransition(g, view.transition);
  }

  drawWaterSurfaces(g, t) {
    const rm = this.settings.reducedMotion;
    for (const w of this.world.water) {
      g.save();
      g.lineWidth = 3;
      g.strokeStyle = PAL.denimLight;
      g.setLineDash([9, 6]);
      g.lineDashOffset = rm ? 0 : -t * 12;
      g.beginPath();
      for (let x = w.x0; x <= w.x1; x += 8) {
        const y = w.y + (rm ? 0 : Math.sin(x / 26 + t * 1.6) * 2.2);
        if (x === w.x0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      if (this.settings.hazardPatterns) {
        // A wave-marked tag floating on the felt water.
        const mx = (w.x0 + w.x1) / 2;
        g.setLineDash([]);
        g.fillStyle = PAL.linen;
        g.strokeStyle = PAL.denimDeep;
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(mx - 22, w.y + 18, 44, 24, 5);
        g.fill();
        g.stroke();
        g.beginPath();
        for (let i = 0; i <= 3; i++) {
          g.moveTo(mx - 16, w.y + 24 + i * 4);
          for (let x = 0; x <= 32; x += 4) g.lineTo(mx - 16 + x, w.y + 24 + i * 4 + Math.sin(x / 2.5) * 1.6);
        }
        g.stroke();
      }
      g.restore();
    }
  }

  drawBody(g, b, t, dt) {
    switch (b.type) {
      case 'button':
        return this.drawButton(g, b);
      case 'reel':
        return this.drawReel(g, b);
      case 'band':
        return this.drawBand(g, b, t);
      case 'ribbon':
        return this.drawRibbon(g, b);
      case 'needle':
        return this.drawNeedle(g, b, t);
      case 'zip':
        return this.drawZip(g, b, t);
      case 'thread':
        return this.drawThread(g, b, dt);
      default:
        return undefined;
    }
  }

  drawButton(g, b) {
    const i = Math.round(b.x / 160) % BUTTON_COLOURS.length;
    const col = BUTTON_COLOURS[(i + BUTTON_COLOURS.length) % BUTTON_COLOURS.length];
    g.save();
    g.shadowColor = 'rgba(40,20,8,0.35)';
    g.shadowBlur = 8;
    g.shadowOffsetX = 4;
    g.shadowOffsetY = 6;
    const grd = g.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
    grd.addColorStop(0, shade(col, 0.25));
    grd.addColorStop(1, shade(col, -0.12));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = shade(col, -0.25);
    g.lineWidth = 5;
    g.beginPath();
    g.arc(b.x, b.y, b.r * 0.8, 0, Math.PI * 2);
    g.stroke();
    // Four holes and the thread crossing them, turning with the button.
    const a = b.s.ang;
    const holes = [0, 1, 2, 3].map((k) => [b.x + Math.cos(a + k * (Math.PI / 2) + Math.PI / 4) * b.r * 0.3, b.y + Math.sin(a + k * (Math.PI / 2) + Math.PI / 4) * b.r * 0.3]);
    g.strokeStyle = PAL.thread;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(...holes[0]);
    g.lineTo(...holes[2]);
    g.moveTo(...holes[1]);
    g.lineTo(...holes[3]);
    g.stroke();
    g.fillStyle = shade(col, -0.45);
    for (const h of holes) {
      g.beginPath();
      g.arc(h[0], h[1], b.r * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    // Direction-of-spin arrow (shape cue, not just motion).
    g.strokeStyle = rgba(PAL.cocoa, 0.45);
    g.lineWidth = 2;
    g.beginPath();
    const dir = Math.sign(b.spin) || 1;
    g.arc(b.x, b.y, b.r * 0.62, a, a + dir * 1.2, dir < 0);
    g.stroke();
  }

  drawReel(g, b) {
    const col = SPOOL_COLOURS[Math.abs(Math.round(b.x / 64)) % SPOOL_COLOURS.length];
    g.save();
    g.shadowColor = 'rgba(40,20,8,0.35)';
    g.shadowBlur = 6;
    g.shadowOffsetX = 3;
    g.shadowOffsetY = 5;
    g.fillStyle = pattern(g, 'wood', PAL.wood, 64);
    g.beginPath();
    g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.fillStyle = col;
    g.beginPath();
    g.arc(b.x, b.y, b.r * 0.78, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = shade(col, -0.25);
    g.lineWidth = 1;
    for (let r = b.r * 0.4; r < b.r * 0.78; r += 2.2) {
      g.beginPath();
      g.arc(b.x, b.y, r, 0, Math.PI * 2);
      g.stroke();
    }
    // Spokes on the end so you can see it turn.
    g.strokeStyle = PAL.woodDeep;
    g.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      const a = b.s.ang + (k * Math.PI * 2) / 3;
      g.beginPath();
      g.moveTo(b.x + Math.cos(a) * b.r * 0.2, b.y + Math.sin(a) * b.r * 0.2);
      g.lineTo(b.x + Math.cos(a) * b.r * 0.38, b.y + Math.sin(a) * b.r * 0.38);
      g.stroke();
    }
    g.fillStyle = PAL.wood;
    g.beginPath();
    g.arc(b.x, b.y, b.r * 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3b2a1f';
    g.beginPath();
    g.arc(b.x, b.y, b.r * 0.13, 0, Math.PI * 2);
    g.fill();
    if (b.motor) {
      g.strokeStyle = rgba(PAL.cocoa, 0.6);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(b.x, b.y, b.r + 5, -2.4, -0.7);
      g.stroke();
    }
  }

  drawBand(g, b, t) {
    const [ax, ay] = b.a;
    const [bx, by] = b.b;
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy);
    const nx = -dy / l;
    const ny = dx / l;
    const v = this.settings.reducedMotion ? 0 : b.s.vib;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = '#c0643f';
    g.lineWidth = 6;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const f = i / 20;
      const hump = Math.sin(Math.PI * f) * (f < b.s.hitU ? f / Math.max(0.05, b.s.hitU) : (1 - f) / Math.max(0.05, 1 - b.s.hitU));
      const d = v * 9 * hump * Math.sin(t * 70);
      const x = ax + dx * f + nx * d;
      const y = ay + dy * f + ny * d;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,230,200,0.5)';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
    for (const [px, py] of [b.a, b.b]) this.pinHead(g, px, py, PAL.mustard);
  }

  pinHead(g, x, y, col) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(x - 2, y - 2, 2, 0, Math.PI * 2);
    g.fill();
  }

  drawRibbon(g, b) {
    const pts = [];
    for (let i = 0; i <= RIBBON_N; i++) pts.push(ribbonPoint(b, i));
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowColor = 'rgba(40,20,8,0.3)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 6;
    g.strokeStyle = PAL.roseDeep;
    g.lineWidth = 11;
    tracePath(g, pts);
    g.stroke();
    g.restore();
    g.save();
    g.strokeStyle = PAL.rose;
    g.lineWidth = 8;
    g.lineCap = 'round';
    tracePath(g, pts);
    g.stroke();
    g.strokeStyle = 'rgba(255,245,240,0.55)';
    g.lineWidth = 2;
    tracePath(g, pts.map((p) => [p[0], p[1] - 2]));
    g.stroke();
    g.restore();
    for (const p of [pts[0], pts[pts.length - 1]]) {
      g.fillStyle = PAL.roseDeep;
      g.beginPath();
      g.ellipse(p[0], p[1] + 2, 9, 6, 0, 0, Math.PI * 2);
      g.fill();
      this.pinHead(g, p[0], p[1] - 4, PAL.denimLight);
    }
  }

  drawNeedle(g, b, t) {
    const tip = needleTip(b, this.world.t);
    const x = b.x;
    // Needle and bar.
    g.fillStyle = '#9aa1a8';
    g.fillRect(x - 4, b.top - 4, 8, Math.max(0, tip - b.top - 34));
    g.strokeStyle = '#d9dee2';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, tip - 38);
    g.lineTo(x, tip);
    g.stroke();
    g.fillStyle = '#5b636b';
    g.beginPath();
    g.ellipse(x, tip - 12, 1, 3, 0, 0, Math.PI * 2);
    g.fill();
    // Thread down to the eye.
    g.strokeStyle = PAL.rust;
    g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(x + 18, b.top - 60);
    g.quadraticCurveTo(x + 14, b.top - 10, x, tip - 12);
    g.stroke();
    // Machine head.
    g.save();
    g.shadowColor = 'rgba(40,20,8,0.4)';
    g.shadowBlur = 10;
    g.shadowOffsetX = 5;
    g.shadowOffsetY = 7;
    g.fillStyle = pattern(g, 'linen', PAL.denimDeep, 64);
    g.beginPath();
    g.roundRect(x - 34, b.top - 70, 60, 70, [16, 16, 6, 6]);
    g.fill();
    g.restore();
    g.strokeStyle = PAL.mustard;
    g.lineWidth = 1.5;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.roundRect(x - 28, b.top - 64, 48, 58, [12, 12, 4, 4]);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = PAL.mustard;
    g.font = '700 15px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.fillText('FL', x - 4, b.top - 30);
    // Spool on top.
    g.fillStyle = PAL.wood;
    g.fillRect(x + 8, b.top - 86, 20, 6);
    g.fillRect(x + 8, b.top - 68, 20, 4);
    g.fillStyle = PAL.rust;
    g.fillRect(x + 10, b.top - 80, 16, 12);
    // Hazard bands on the bar: stripes, so it reads without colour.
    if (this.settings.hazardPatterns) {
      g.save();
      g.beginPath();
      g.rect(x - 4, b.top, 8, Math.max(0, tip - b.top - 34));
      g.clip();
      g.strokeStyle = PAL.mustard;
      g.lineWidth = 3;
      for (let y = b.top - 10; y < tip; y += 10) {
        g.beginPath();
        g.moveTo(x - 6, y);
        g.lineTo(x + 6, y + 6);
        g.stroke();
      }
      g.restore();
    }
    void t;
  }

  drawZip(g, b, t) {
    const [ax, ay] = b.a;
    const [bx, by] = b.b;
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy);
    const ux = dx / l;
    const uy = dy / l;
    const off = this.settings.reducedMotion ? 0 : (((t * b.speed) % 12) + 12) % 12;
    g.fillStyle = '#c9ced4';
    for (let d = off, k = 0; d < l; d += 6, k++) {
      const x = ax + ux * d;
      const y = ay + uy * d;
      g.fillRect(x - 2, y + (k % 2 ? 1 : -3), 4, 4);
    }
    // Pull tab at the end the zip runs toward, with an arrow.
    const end = b.speed > 0 ? [bx, by] : [ax, ay];
    g.fillStyle = PAL.mustardDeep;
    g.beginPath();
    g.roundRect(end[0] - 7, end[1] - 4, 14, 20, 4);
    g.fill();
    g.fillStyle = rgba(PAL.cocoa, 0.6);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 + 16;
    const s = Math.sign(b.speed);
    g.beginPath();
    g.moveTo(mx + s * 12, my);
    g.lineTo(mx - s * 4, my - 7);
    g.lineTo(mx - s * 4, my + 7);
    g.closePath();
    g.fill();
  }

  drawThread(g, b, dt) {
    let st = this.threads.get(b);
    if (!st) this.threads.set(b, (st = { th: 0, w: 0 }));
    const ball = this.world.ball;
    const L = b.len;
    // A pendulum the ball can push.
    st.w += (-(GRAVITY / L) * Math.sin(st.th) - st.w * 1.5) * dt;
    const ex = b.x + Math.sin(st.th) * L;
    const ey = b.y + Math.cos(st.th) * L;
    const near = Math.hypot(ball.x - ex, ball.y - ey) < 60 || (b.s.snag && ball.y > b.y);
    if (b.s.snag && ball.state === 'moving') st.w += (ball.vx / L) * dt * 6;
    st.th += st.w * dt;
    st.th = Math.max(-0.9, Math.min(0.9, st.th));
    g.save();
    g.strokeStyle = PAL.rose;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(b.x, b.y);
    if (b.s.snag && near) g.quadraticCurveTo(ball.x, ball.y - ball.r, ex + (ball.x - ex) * 0.6, ey);
    else g.quadraticCurveTo(b.x + Math.sin(st.th) * L * 0.4, b.y + L * 0.6, ex, ey);
    g.stroke();
    // A frayed end.
    g.lineWidth = 1;
    for (const k of [-1, 0, 1]) {
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex + k * 3, ey + 7);
      g.stroke();
    }
    g.restore();
    this.pinHead(g, b.x, b.y + 4, PAL.rose);
  }

  drawFan(g, f, t, dt) {
    const rm = this.settings.reducedMotion;
    const flap = rm ? 0 : Math.sin((2 * Math.PI * t) / (f.period ?? 2.4)) * 0.18;
    const a = f.dir + flap;
    g.save();
    g.translate(f.x, f.y);
    g.rotate(a);
    // Lace hand fan: ribs and a scalloped felt leaf, opening toward the wind.
    const R = 70;
    g.shadowColor = 'rgba(40,20,8,0.35)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 5;
    g.fillStyle = pattern(g, 'felt', PAL.rose, 64);
    g.beginPath();
    g.moveTo(0, 0);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const ang = -0.9 + (1.8 * i) / n;
      g.lineTo(Math.cos(ang) * R, Math.sin(ang) * R);
      if (i < n) {
        const mid = ang + 0.9 / n;
        g.quadraticCurveTo(Math.cos(mid) * (R + 12), Math.sin(mid) * (R + 12), Math.cos(ang + 1.8 / n) * R, Math.sin(ang + 1.8 / n) * R);
      }
    }
    g.closePath();
    g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = PAL.woodDeep;
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      const ang = -0.9 + (1.8 * i) / n;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(ang) * (R - 4), Math.sin(ang) * (R - 4));
      g.stroke();
    }
    stitchLine(g, this.circlePts(0, 0, R - 14, 30).filter((p) => Math.abs(Math.atan2(p[1], p[0])) < 0.85), PAL.thread, 1.5, [4, 4]);
    g.fillStyle = PAL.mustard;
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // Wind wisps: curls of thread drifting along the draught.
    if (!f._wisps) f._wisps = [];
    if (!rm && Math.random() < dt * 9) f._wisps.push({ d: 70, o: (Math.random() - 0.5) * f.width * 0.6, life: 0 });
    g.save();
    g.strokeStyle = 'rgba(255,250,240,0.7)';
    g.lineWidth = 1.5;
    const dx = Math.cos(f.dir);
    const dy = Math.sin(f.dir);
    for (const w of f._wisps) {
      w.d += dt * 260;
      w.life += dt;
      const x = f.x + dx * w.d - dy * w.o * (0.55 + 0.45 * (w.d / f.len));
      const y = f.y + dy * w.d + dx * w.o * (0.55 + 0.45 * (w.d / f.len));
      g.globalAlpha = Math.max(0, 1 - w.d / f.len);
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x - dx * 14 + 6, y - dy * 14 - 6, x - dx * 22 - 6, y - dy * 22 + 6, x - dx * 34, y - dy * 34);
      g.stroke();
    }
    f._wisps = f._wisps.filter((w) => w.d < f.len);
    g.restore();
  }

  drawPins(g, p) {
    const x = p.x;
    const y = p.y;
    const r = p.r;
    // Pins first, behind the cushion.
    const heads = [PAL.mustard, PAL.denimLight, PAL.rose, PAL.thread, PAL.sage, PAL.mustard];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42;
      const x1 = x + Math.cos(a) * r * 0.4;
      const y1 = y + Math.sin(a) * r * 0.4;
      const x2 = x + Math.cos(a) * (r + 12);
      const y2 = y + Math.sin(a) * (r + 12);
      g.strokeStyle = PAL.pin;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.fillStyle = heads[i];
      g.beginPath();
      g.arc(x2, y2, 3.4, 0, Math.PI * 2);
      g.fill();
    }
    g.save();
    g.shadowColor = 'rgba(40,20,8,0.35)';
    g.shadowBlur = 5;
    g.shadowOffsetY = 3;
    g.fillStyle = pattern(g, 'felt', PAL.rust, 64);
    g.beginPath();
    g.ellipse(x, y + r * 0.15, r * 0.95, r * 0.75, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = PAL.rustDeep;
    g.lineWidth = 1.5;
    for (const k of [-0.45, 0, 0.45]) {
      g.beginPath();
      g.ellipse(x + k * r, y + r * 0.15, r * 0.25, r * 0.72, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = PAL.sageDeep;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      g.lineTo(x + Math.cos(a) * 7, y - r * 0.55 + Math.sin(a) * 4);
      g.lineTo(x + Math.cos(a + 0.6) * 2, y - r * 0.55 + Math.sin(a + 0.6) * 1.5);
    }
    g.fill();
    if (this.settings.hazardPatterns) {
      // A triangular, hatched hazard tag: shape and pattern, not just colour.
      const ty = y + r + 6;
      g.save();
      g.beginPath();
      g.moveTo(x, ty);
      g.lineTo(x + 13, ty + 20);
      g.lineTo(x - 13, ty + 20);
      g.closePath();
      g.fillStyle = PAL.linen;
      g.fill();
      g.clip();
      g.strokeStyle = PAL.cocoa;
      g.lineWidth = 2;
      for (let k = -20; k < 30; k += 6) {
        g.beginPath();
        g.moveTo(x - 16 + k, ty + 22);
        g.lineTo(x - 4 + k, ty - 2);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = PAL.cocoa;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, ty);
      g.lineTo(x + 13, ty + 20);
      g.lineTo(x - 13, ty + 20);
      g.closePath();
      g.stroke();
    }
  }

  drawWobbles(g, dt) {
    const th = this.theme;
    for (const w of this.wobbles) {
      w.t += dt;
      const k = Math.exp(-w.t * 6);
      g.save();
      g.strokeStyle = rgba(th.stitch, 0.9 * k);
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      for (let x = -40; x <= 40; x += 4) {
        const y = w.y + 7 + Math.sin(x / 7 - w.t * 30) * w.amp * k * Math.cos((x / 40) * (Math.PI / 2));
        if (x === -40) g.moveTo(w.x + x, y);
        else g.lineTo(w.x + x, y);
      }
      g.stroke();
      g.restore();
    }
    this.wobbles = this.wobbles.filter((w) => w.t < 0.8);
  }

  drawFlag(g, t, sinkT) {
    const cup = this.world.cup;
    const x = cup.x + cup.hw - 2;
    const lift = sinkT != null ? Math.min(1, sinkT * 2) * 20 : 0;
    const top = cup.y - 108 - lift;
    g.strokeStyle = '#b8bec4';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, cup.y + cup.depth - 2);
    g.lineTo(x, top);
    g.stroke();
    this.pinHead(g, x, top, PAL.rose);
    const rm = this.settings.reducedMotion;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      const wave = rm ? 0 : Math.sin(t * 3 + f * 4) * 4 * f;
      pts.push([x + f * 62, top + 6 + f * 18 + wave]);
    }
    const bottom = [];
    for (let i = 8; i >= 0; i--) {
      const f = i / 8;
      const wave = rm ? 0 : Math.sin(t * 3 + f * 4) * 4 * f;
      bottom.push([x + f * 62, top + 46 - f * 18 + wave]);
    }
    const shape = [...pts, ...bottom];
    g.save();
    g.shadowColor = 'rgba(40,20,8,0.3)';
    g.shadowBlur = 5;
    g.shadowOffsetX = 3;
    g.shadowOffsetY = 4;
    g.fillStyle = pattern(g, 'felt', this.theme.flag, 64);
    tracePath(g, shape, true);
    g.fill();
    g.restore();
    // Satin-stitch embroidery: tight parallel threads making the hole number.
    g.save();
    tracePath(g, shape, true);
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    for (let k = -10; k < 70; k += 3) {
      g.beginPath();
      g.moveTo(x + k, top);
      g.lineTo(x + k + 10, top + 60);
      g.stroke();
    }
    g.restore();
    const num = String(this.world.hole.number ?? '★');
    g.save();
    g.font = '700 22px Fredoka, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = PAL.thread;
    const wy = rm ? 0 : Math.sin(t * 3 + 1.2) * 1.5;
    g.fillText(num, x + 24, top + 26 + wy);
    g.restore();
    stitchLine(g, offsetPolyline(shape, -5, true), rgba(PAL.thread, 0.85), 1.2, [3, 3], true);
  }

  drawAim(g, aim, pull) {
    const b = this.world.ball;
    const v = aim.power * MAX_SHOT;
    const vx = Math.cos(aim.angle) * v;
    const vy = -Math.sin(aim.angle) * v;
    const T = 0.12 + aim.power * 0.38;
    const pts = [];
    for (let t = 0; t <= T; t += 0.012) pts.push([b.x + vx * t, b.y + vy * t + 0.5 * GRAVITY * t * t]);
    if (pts.length < 2) return;
    // Running stitch: thread above, a needle at the end.
    g.save();
    g.lineCap = 'round';
    g.lineWidth = 3.2;
    g.setLineDash([9, 8]);
    g.lineDashOffset = -this.time * 20;
    g.strokeStyle = 'rgba(40,25,10,0.3)';
    tracePath(g, pts.map((p) => [p[0] + 1, p[1] + 2]));
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = PAL.cocoa;
    tracePath(g, pts);
    g.stroke();
    g.lineWidth = 2.6;
    g.strokeStyle = aim.power > 0.85 ? PAL.mustard : PAL.thread;
    tracePath(g, pts);
    g.stroke();
    g.restore();
    const e = pts[pts.length - 1];
    const p = pts[pts.length - 2];
    const a = Math.atan2(e[1] - p[1], e[0] - p[0]);
    g.save();
    g.translate(e[0], e[1]);
    g.rotate(a);
    g.strokeStyle = '#d9dee2';
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(-16, 0);
    g.lineTo(6, 0);
    g.stroke();
    g.strokeStyle = '#6b737b';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(-12, 0, 2.4, 0.9, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    // The pulled-back thread from the ball to the finger.
    if (pull) {
      const [wx, wy] = this.toWorld(pull[0], pull[1]);
      g.save();
      g.strokeStyle = rgba(PAL.cocoa, 0.55);
      g.lineWidth = 1.6;
      g.setLineDash([3, 4]);
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(wx, wy);
      g.stroke();
      g.restore();
    }
  }

  drawBall(g, dt, view) {
    const b = this.world.ball;
    const r = b.r;
    this.squash *= Math.exp(-dt * 12);
    let scale = 1;
    let dy = 0;
    if (view.sinkT != null) {
      const k = Math.min(1, view.sinkT / 0.35);
      scale = 1 - k * 0.35;
      dy = k * 10;
      if (view.sinkT > 0.45) return;
    }
    if (view.outT != null) {
      scale = Math.max(0, 1 - view.outT * 1.6);
      if (scale <= 0) return;
    }
    // Soft shadow on the cloth below.
    const gy = groundYAt(this.world.ground, b.x);
    const h = Math.max(0, gy - b.y - r);
    if (h < 260 && view.sinkT == null) {
      const k = 1 - h / 260;
      g.fillStyle = `rgba(40,20,8,${0.28 * k})`;
      g.beginPath();
      g.ellipse(b.x + 3, gy - 1, r * (0.7 + 0.5 * k), r * 0.25, 0, 0, Math.PI * 2);
      g.fill();
    }
    const px = r * this.cam.s * this.dpr;
    const spr = pompomSprite(Math.max(4, Math.round(px)), PAL.mustard);
    const size = (spr.width / Math.max(4, Math.round(px))) * r;
    g.save();
    g.translate(b.x, b.y + dy);
    const sq = this.settings.reducedMotion ? 0 : this.squash;
    if (sq > 0.01) {
      const ang = Math.atan2(this.squashN[1], this.squashN[0]);
      g.rotate(ang);
      g.scale(1 - sq, 1 + sq * 0.6);
      g.rotate(-ang);
    }
    g.rotate(b.spin);
    g.scale(scale, scale);
    g.drawImage(spr, -size / 2, -size / 2, size, size);
    g.restore();
  }

  drawParticles(g, dt) {
    for (const p of this.particles) {
      p.life -= dt / p.max;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'fluff' ? 60 : 500) * dt;
      p.vx *= Math.exp(-dt * (p.kind === 'fluff' ? 3 : 1));
      p.a += dt * 3;
      g.globalAlpha = Math.max(0, p.life);
      g.strokeStyle = p.c;
      g.fillStyle = p.c;
      if (p.kind === 'splash') {
        g.beginPath();
        g.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === 'pop') {
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        g.stroke();
      } else {
        g.lineWidth = p.kind === 'thread' ? 1.5 : 1.2;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.quadraticCurveTo(p.x + Math.cos(p.a) * 5, p.y + Math.sin(p.a) * 5, p.x + Math.cos(p.a + 1) * 8, p.y + Math.sin(p.a + 1) * 6);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  /** Thread unspooling across the top as a hole opens (screen space, p 0..1). */
  drawIntro(g, p) {
    const w = this.w;
    const y = 74;
    const x = 30 + (w - 60) * Math.min(1, p * 1.3);
    g.save();
    g.strokeStyle = this.theme.flag;
    g.lineWidth = 2.5;
    g.setLineDash([10, 7]);
    g.beginPath();
    g.moveTo(30, y);
    g.quadraticCurveTo((30 + x) / 2, y + 16, x, y);
    g.stroke();
    g.setLineDash([]);
    // The spool turning as it lets out thread.
    g.translate(30, y);
    g.rotate(p * 18);
    g.fillStyle = PAL.wood;
    g.fillRect(-14, -16, 28, 6);
    g.fillRect(-14, 10, 28, 6);
    g.fillStyle = this.theme.flag;
    g.fillRect(-11, -10, 22, 20);
    g.restore();
  }

  /** Stitch-in transition: a pinked felt panel sweeps across, stitched along its edge (t 0..2). */
  drawTransition(g, t) {
    const w = this.w;
    const h = this.h;
    if (this.settings.reducedMotion) {
      g.fillStyle = `rgba(233,220,195,${t < 1 ? t : 2 - t})`;
      g.fillRect(0, 0, w, h);
      return;
    }
    const ease = (x) => x * x * (3 - 2 * x);
    let x0 = 0;
    let x1 = w;
    if (t < 1) x1 = ease(t) * (w + 40);
    else x0 = ease(t - 1) * (w + 40);
    const edge = [];
    for (let y = -10, s = 0; y <= h + 10; y += 9, s ^= 1) edge.push([x1 + (s ? 7 : 0), y]);
    g.save();
    g.fillStyle = pattern(g, 'felt', PAL.oatmeal, 128);
    g.beginPath();
    g.moveTo(x0, -10);
    for (const p of edge) g.lineTo(p[0], p[1]);
    g.lineTo(x0, h + 10);
    g.closePath();
    g.shadowColor = 'rgba(40,20,8,0.35)';
    g.shadowBlur = 14;
    g.shadowOffsetX = 6;
    g.fill();
    g.restore();
    stitchLine(g, [[x1 - 12, -10], [x1 - 12, h + 10]], PAL.rust, 2.5, [10, 8]);
    if (t >= 1) stitchLine(g, [[x0 + 12, -10], [x0 + 12, h + 10]], PAL.rust, 2.5, [10, 8]);
  }
}
