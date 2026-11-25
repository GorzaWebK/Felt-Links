// The scorecard as a cross-stitch sampler on aida cloth, filled in stitch by stitch.

import { PAL, fabricTile, makeCanvas } from './art.js';

// 3x5 stitch font.
const F = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
  8: '111101111101111', 9: '111101111001110',
  '+': '000010111010000', '-': '000000111000000', "'": '010010000000000', ' ': '000000000000000',
  '/': '001001010100100', '.': '000000000000010',
};
const THIMBLE = ['01110', '10101', '11111', '10101', '11111'];

function glyphs(text, x, y, color, out, group) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = F[ch] || F[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') out.push({ x: cx + c, y: y + r, color, group });
    cx += 4;
  }
  return cx - x - 1;
}

function textWidth(text) {
  return text.length * 4 - 1;
}

function thimble(x, y, filled, out, group) {
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      if (THIMBLE[r][c] === '1') out.push({ x: x + c, y: y + r, color: filled ? PAL.mustardDeep : '#d9ccb4', group, faint: !filled });
}

/**
 * rows: [{ label, par, strokes|null, thimbles }], highlight: index of the row being stitched now.
 * Returns { canvas, play(onStitch) } where play animates the new stitches.
 */
export function buildSampler(title, rows, highlight, opts = {}) {
  const stitches = [];
  const COLS = { no: 0, par: 13, you: 29, th: 43 };
  const bodyW = 60;
  const titleW = textWidth(title);
  const W = Math.max(bodyW, titleW) + 8;
  const left = Math.floor((W - bodyW) / 2);
  let y = 4;
  glyphs(title, Math.floor((W - titleW) / 2), y, PAL.rust, stitches, 'title');
  y += 8;
  glyphs('NO', left + COLS.no, y, PAL.cocoa, stitches, 'head');
  glyphs('PAR', left + COLS.par, y, PAL.cocoa, stitches, 'head');
  glyphs('YOU', left + COLS.you, y, PAL.cocoa, stitches, 'head');
  thimble(left + COLS.th + 6, y, true, stitches, 'head');
  y += 6;
  for (let x = left; x < left + bodyW; x += 2) stitches.push({ x, y, color: PAL.sageDeep, group: 'head' });
  y += 2;
  let totPar = 0;
  let totYou = 0;
  rows.forEach((row, i) => {
    const group = i === highlight ? 'new' : 'old';
    glyphs(String(row.label), left + COLS.no, y, PAL.cocoa, stitches, 'old');
    glyphs(String(row.par), left + COLS.par, y, PAL.sageDeep, stitches, 'old');
    totPar += row.par;
    if (row.strokes != null) {
      totYou += row.strokes;
      const diff = row.strokes - row.par;
      const col = diff < 0 ? PAL.denimDeep : diff === 0 ? PAL.sageDeep : PAL.rust;
      glyphs(String(row.strokes), left + COLS.you, y, col, stitches, group);
      for (let k = 0; k < 3; k++) thimble(left + COLS.th + k * 6, y, k < row.thimbles, stitches, group);
    } else {
      // Not played yet: a faint tacking line.
      for (let x = left + COLS.you; x < left + COLS.you + 7; x += 2) stitches.push({ x, y: y + 2, color: '#cdbfa5', group: 'old', faint: true });
    }
    y += 7;
  });
  if (rows.length > 1) {
    for (let x = left; x < left + bodyW; x += 2) stitches.push({ x, y, color: PAL.sageDeep, group: 'old' });
    y += 2;
    glyphs('TOT', left + COLS.no, y, PAL.cocoa, stitches, 'old');
    glyphs(String(totPar), left + COLS.par, y, PAL.sageDeep, stitches, 'old');
    glyphs(String(totYou || '-'), left + COLS.you, y, PAL.rust, stitches, highlight != null ? 'new' : 'old');
    y += 7;
  }
  if (opts.footer) {
    y += 1;
    const fw = textWidth(opts.footer);
    glyphs(opts.footer, Math.floor((W - fw) / 2), y, PAL.roseDeep, stitches, 'new');
    y += 7;
  }
  const H = y + 3;

  // Border: a running zig-zag in dusty rose.
  for (let x = 1; x < W - 1; x++) {
    if ((x + 1) % 2) continue;
    stitches.push({ x, y: 1, color: PAL.roseDeep, group: 'border' });
    stitches.push({ x, y: H - 2, color: PAL.roseDeep, group: 'border' });
  }
  for (let yy = 3; yy < H - 2; yy += 2) {
    stitches.push({ x: 1, y: yy, color: PAL.roseDeep, group: 'border' });
    stitches.push({ x: W - 2, y: yy, color: PAL.roseDeep, group: 'border' });
  }

  const maxW = opts.maxWidth || 420;
  const maxH = opts.maxHeight || 560;
  const u = Math.max(4, Math.floor(Math.min(maxW / W, maxH / H)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = makeCanvas(W * u * dpr, H * u * dpr);
  canvas.style.width = `${W * u}px`;
  canvas.style.height = `${H * u}px`;
  canvas.className = 'sampler-canvas';
  canvas.setAttribute('role', 'img');
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);

  // Aida cloth: a little grid of holes.
  g.fillStyle = g.createPattern(fabricTile('linen', PAL.linen, 64), 'repeat');
  g.fillRect(0, 0, W * u, H * u);
  g.fillStyle = 'rgba(120,100,70,0.16)';
  for (let yy = 0; yy <= H; yy++) for (let xx = 0; xx <= W; xx++) g.fillRect(xx * u - 0.6, yy * u - 0.6, 1.2, 1.2);

  const drawStitch = (s) => {
    const x = s.x * u;
    const yy = s.y * u;
    const p = u * 0.16;
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.2, u * 0.28);
    g.strokeStyle = 'rgba(40,25,10,0.25)';
    g.beginPath();
    g.moveTo(x + p + 0.6, yy + p + 0.9);
    g.lineTo(x + u - p + 0.6, yy + u - p + 0.9);
    g.moveTo(x + u - p + 0.6, yy + p + 0.9);
    g.lineTo(x + p + 0.6, yy + u - p + 0.9);
    g.stroke();
    g.strokeStyle = s.color;
    g.globalAlpha = s.faint ? 0.7 : 1;
    g.beginPath();
    g.moveTo(x + p, yy + p);
    g.lineTo(x + u - p, yy + u - p);
    g.moveTo(x + u - p, yy + p);
    g.lineTo(x + p, yy + u - p);
    g.stroke();
    g.globalAlpha = 1;
  };
  const now = stitches.filter((s) => s.group !== 'new');
  const later = stitches.filter((s) => s.group === 'new');
  now.forEach(drawStitch);
  canvas.setAttribute('aria-label', opts.label || title);

  let raf = 0;
  return {
    canvas,
    play(onStitch, reduced) {
      if (reduced || !later.length) {
        later.forEach(drawStitch);
        return;
      }
      let i = 0;
      let last = performance.now();
      const tick = (t) => {
        const n = Math.max(1, Math.floor(((t - last) / 1000) * 90));
        last = t;
        for (let k = 0; k < n && i < later.length; k++, i++) {
          drawStitch(later[i]);
          if (i % 5 === 0) onStitch?.(later[i]);
        }
        if (i < later.length) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(raf);
      later.forEach(drawStitch);
    },
  };
}
