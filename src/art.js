// Textile art made in code: felt noise, woven fabrics, stitches, pinked edges,
// the pompom and the favicon. Everything is drawn on canvases at start-up.

import { mulberry32 } from './rng.js';

export const PAL = {
  oatmeal: '#e9dcc3',
  oatmealDeep: '#d8c6a4',
  linen: '#f4ecdc',
  mustard: '#d5a33d',
  mustardDeep: '#b7862a',
  rust: '#b65a3b',
  rustDeep: '#8f4329',
  sage: '#93a67f',
  sageDeep: '#6f8562',
  moss: '#7d9468',
  rose: '#d69c95',
  roseDeep: '#b87872',
  denim: '#58748f',
  denimDeep: '#3f5770',
  denimLight: '#9fb4c8',
  sand: '#e3c897',
  sandDeep: '#c9a96f',
  wood: '#b98b5b',
  woodDeep: '#8a6340',
  cocoa: '#5b4433', // text and dark thread
  thread: '#f7f0e1',
  chalk: '#fbf7ee',
  pin: '#c9ced4',
};

export const THEMES = {
  meadow: {
    ground: PAL.sage,
    groundDeep: PAL.sageDeep,
    patches: [PAL.moss, PAL.sage, '#a3b48c', PAL.mustard, '#a9b98f'],
    stitch: PAL.thread,
    sky: [PAL.oatmeal, '#efe3cb', '#e7cfc2', '#e4dcc0', '#f1e6cf'],
    skyPrints: ['gingham', 'dots', 'plain', 'sprig', 'plain', 'dots'],
    skyTint: ['#dcb6ae', '#c9d2b4', '#e8d19a'],
    water: PAL.denim,
    solid: { mustard: PAL.mustard, rust: PAL.rust, rose: PAL.rose, sage: PAL.sageDeep, wood: PAL.wood, denim: PAL.denim },
    light: 'rgba(255, 214, 150, 0.22)',
    flag: PAL.rust,
  },
  seaside: {
    ground: PAL.sand,
    groundDeep: PAL.sandDeep,
    patches: [PAL.sand, '#ead3a6', '#dcbd86', '#e8cfa0', PAL.rose],
    stitch: PAL.rustDeep,
    sky: [PAL.denimLight, '#b6c6d4', '#c9d4dc', '#aebfcf', '#d5dcdf'],
    skyPrints: ['stripes', 'plain', 'dots', 'plain', 'gingham', 'stripes'],
    skyTint: ['#e9dcc3', '#d69c95', '#f1e7d2'],
    water: PAL.denim,
    solid: { mustard: PAL.mustard, rust: PAL.rust, rose: PAL.rose, sage: PAL.sage, wood: PAL.wood, denim: PAL.denim },
    light: 'rgba(255, 226, 170, 0.2)',
    flag: PAL.denimDeep,
  },
  attic: {
    ground: PAL.rust,
    groundDeep: PAL.rustDeep,
    patches: [PAL.rust, '#c06a48', '#a85234', PAL.mustardDeep, PAL.roseDeep],
    stitch: PAL.mustard,
    sky: ['#c79f78', '#bf956d', '#caa27c', '#c39a72', '#cfa983'],
    skyPrints: ['wood', 'wood', 'wood', 'wood', 'wood', 'wood'],
    skyTint: ['#d69c95', '#e9dcc3', '#93a67f'],
    water: PAL.denim,
    solid: { mustard: PAL.mustard, rust: PAL.rustDeep, rose: PAL.rose, sage: PAL.sage, wood: PAL.wood, denim: PAL.denim },
    light: 'rgba(255, 200, 120, 0.24)',
    flag: PAL.mustardDeep,
  },
};

const isNode = typeof document === 'undefined';

export function makeCanvas(w, h) {
  if (isNode) return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ------------------------------------------------------------- fabric tiles

const tileCache = new Map();

/** A seamless fabric tile: felt (noise and fibres), corduroy, satin, denim, gingham, dots... */
export function fabricTile(kind, color, size = 128) {
  const key = `${kind}|${color}|${size}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const rnd = mulberry32(size * 31 + color.length * 7 + kind.length * 131);
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);

  const speckle = (n, light, dark, rMax = 1.4) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      g.fillStyle = rnd() < 0.5 ? light : dark;
      const r = 0.4 + rnd() * rMax;
      for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [-size, 0], [0, -size]]) {
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  const fibres = (n, light, dark, len = 7) => {
    g.lineWidth = 0.7;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const a = rnd() * Math.PI * 2;
      const l = 2 + rnd() * len;
      g.strokeStyle = rnd() < 0.5 ? light : dark;
      for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [-size, 0], [0, -size]]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(x + ox + Math.cos(a + 0.8) * l * 0.5, y + oy + Math.sin(a + 0.8) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        g.stroke();
      }
    }
  };

  const light = rgba('#ffffff', 0.09);
  const dark = rgba('#000000', 0.07);
  switch (kind) {
    case 'felt':
    default:
      // Soft mottling, then dense speckle and short fibres: pressed wool.
      for (let i = 0; i < 40; i++) {
        const x = rnd() * size;
        const y = rnd() * size;
        const r = 8 + rnd() * 22;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        const tone = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.045)';
        grd.addColorStop(0, tone);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, size, size);
      }
      speckle(900, light, dark, 1.1);
      fibres(260, rgba('#ffffff', 0.13), rgba('#000000', 0.1));
      break;
    case 'corduroy':
      for (let x = 0; x < size; x += 8) {
        const grd = g.createLinearGradient(x, 0, x + 8, 0);
        grd.addColorStop(0, 'rgba(0,0,0,0.16)');
        grd.addColorStop(0.45, 'rgba(255,255,255,0.14)');
        grd.addColorStop(1, 'rgba(0,0,0,0.16)');
        g.fillStyle = grd;
        g.fillRect(x, 0, 8, size);
      }
      speckle(300, light, dark, 0.8);
      break;
    case 'satin': {
      const grd = g.createLinearGradient(0, 0, size, size);
      for (let i = 0; i <= 4; i++) {
        grd.addColorStop(i / 4, i % 2 ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0)');
      }
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      for (let y = 0; y < size; y += 3) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(size, y);
        g.stroke();
      }
      break;
    }
    case 'denim':
      g.lineWidth = 1.2;
      for (let i = -size; i < size * 2; i += 4) {
        g.strokeStyle = i % 8 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + size, size);
        g.stroke();
      }
      speckle(400, 'rgba(255,255,255,0.12)', dark, 0.7);
      break;
    case 'gingham': {
      const s = size / 8;
      g.fillStyle = 'rgba(255,255,255,0.28)';
      for (let i = 0; i < 8; i += 2) {
        g.fillRect(i * s, 0, s, size);
        g.fillRect(0, i * s, size, s);
      }
      speckle(300, light, dark, 0.6);
      break;
    }
    case 'stripes': {
      const s = size / 8;
      g.fillStyle = 'rgba(255,255,255,0.3)';
      for (let i = 0; i < 8; i += 2) g.fillRect(0, i * s, size, s * 0.8);
      speckle(300, light, dark, 0.6);
      break;
    }
    case 'dots': {
      g.fillStyle = 'rgba(255,255,255,0.42)';
      const s = size / 4;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.beginPath();
          g.arc(x * s + (y % 2 ? s / 2 : 0) + s / 4, y * s + s / 2, s * 0.13, 0, Math.PI * 2);
          g.fill();
        }
      speckle(300, light, dark, 0.6);
      break;
    }
    case 'sprig': {
      // Tiny printed flowers.
      for (let i = 0; i < 10; i++) {
        const x = (i * 37) % size + 8;
        const y = (i * 53) % size + 8;
        g.fillStyle = 'rgba(255,255,255,0.4)';
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 3, y + Math.sin(a) * 3, 2, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(160,110,40,0.35)';
        g.beginPath();
        g.arc(x, y, 1.5, 0, Math.PI * 2);
        g.fill();
      }
      speckle(300, light, dark, 0.6);
      break;
    }
    case 'wood':
      g.lineWidth = 1;
      for (let y = 0; y < size; y += 3 + rnd() * 3) {
        g.strokeStyle = rnd() < 0.5 ? 'rgba(90,55,25,0.16)' : 'rgba(255,240,210,0.1)';
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin((x / size) * Math.PI * 2 + y) * 1.5);
        g.stroke();
      }
      break;
    case 'linen':
      g.lineWidth = 1;
      for (let i = 0; i < size; i += 2) {
        g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, size);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i);
        g.lineTo(size, i);
        g.stroke();
      }
      speckle(300, light, dark, 0.6);
      break;
  }
  tileCache.set(key, c);
  return c;
}

export function pattern(ctx, kind, color, size) {
  return ctx.createPattern(fabricTile(kind, color, size), 'repeat');
}

/** A data: URL of a felt tile, for CSS backgrounds. */
export function tileURL(kind, color, size = 128) {
  if (isNode) return '';
  return fabricTile(kind, color, size).toDataURL('image/png');
}

// ------------------------------------------------------------- geometry helpers

/** Offsets an open or closed polyline by d (positive = to the left of travel, i.e. inside the ground). */
export function offsetPolyline(pts, d, closed = false) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const cur = pts[i];
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let n1x = 0;
    let n1y = 0;
    let n2x = 0;
    let n2y = 0;
    if (prev !== cur) {
      const dx = cur[0] - prev[0];
      const dy = cur[1] - prev[1];
      const l = Math.hypot(dx, dy) || 1;
      n1x = -dy / l;
      n1y = dx / l;
    }
    if (next !== cur) {
      const dx = next[0] - cur[0];
      const dy = next[1] - cur[1];
      const l = Math.hypot(dx, dy) || 1;
      n2x = -dy / l;
      n2y = dx / l;
    }
    if (prev === cur) {
      n1x = n2x;
      n1y = n2y;
    }
    if (next === cur) {
      n2x = n1x;
      n2y = n1y;
    }
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const cos = mx * n1x + my * n1y;
    const k = d / Math.max(0.35, cos);
    out.push([cur[0] + mx * k, cur[1] + my * k]);
  }
  return out;
}

export function tracePath(ctx, pts, closed = false) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
}

/** Running stitch along a path. */
export function stitchLine(ctx, pts, color, width = 2, dash = [7, 6], closed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.setLineDash(dash);
  tracePath(ctx, pts, closed);
  ctx.stroke();
  // Each stitch casts a hair of shadow so it sits on the fabric.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.strokeStyle = 'rgba(40,25,10,0.25)';
  ctx.translate(0.8, 1.2);
  tracePath(ctx, pts, closed);
  ctx.stroke();
  ctx.restore();
}

/** Zig-zag (pinking shears) version of a polyline: teeth of the given size. */
export function pinkedPoints(pts, tooth = 7, closed = false) {
  const out = [];
  const n = pts.length;
  let side = 1;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 0.5) continue;
    const nx = -dy / l;
    const ny = dx / l;
    const steps = Math.max(1, Math.round(l / tooth));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      out.push([a[0] + dx * f + nx * side * tooth * 0.45, a[1] + dy * f + ny * side * tooth * 0.45]);
      side = -side;
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// ------------------------------------------------------------- the pompom

const ballCache = new Map();

/** A fluffy wool pompom, drawn once per size and colour. */
export function pompomSprite(radiusPx, color = PAL.mustard) {
  const key = `${Math.round(radiusPx * 4)}|${color}`;
  if (ballCache.has(key)) return ballCache.get(key);
  const pad = radiusPx * 0.55;
  const S = Math.ceil((radiusPx + pad) * 2);
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const cx = S / 2;
  const cy = S / 2;
  const rnd = mulberry32(7);
  const grd = g.createRadialGradient(cx - radiusPx * 0.3, cy - radiusPx * 0.35, radiusPx * 0.1, cx, cy, radiusPx * 1.05);
  grd.addColorStop(0, shade(color, 0.35));
  grd.addColorStop(0.6, color);
  grd.addColorStop(1, shade(color, -0.3));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, radiusPx * 0.92, 0, Math.PI * 2);
  g.fill();
  // Hundreds of wool strands, radiating with a curl.
  const strands = Math.round(70 + radiusPx * 14);
  g.lineCap = 'round';
  for (let i = 0; i < strands; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = radiusPx * (0.2 + rnd() * 0.6);
    const r1 = radiusPx * (0.95 + rnd() * 0.38);
    const curl = (rnd() - 0.5) * 0.6;
    const lightSide = Math.cos(a + 2.3) * 0.5 + 0.5; // light from the top left
    g.strokeStyle = shade(color, -0.32 + lightSide * 0.55 + (rnd() - 0.5) * 0.15);
    g.lineWidth = Math.max(0.6, radiusPx * (0.06 + rnd() * 0.06));
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    g.quadraticCurveTo(
      cx + Math.cos(a + curl) * (r0 + r1) * 0.55,
      cy + Math.sin(a + curl) * (r0 + r1) * 0.55,
      cx + Math.cos(a + curl * 0.4) * r1,
      cy + Math.sin(a + curl * 0.4) * r1,
    );
    g.stroke();
  }
  ballCache.set(key, c);
  return c;
}

// ------------------------------------------------------------- favicon

export function makeFavicon() {
  if (isNode) return;
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = PAL.sage;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = PAL.thread;
  g.lineWidth = 2.5;
  g.setLineDash([5, 4]);
  g.beginPath();
  g.arc(32, 32, 25, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.drawImage(pompomSprite(13, PAL.mustard), 32 - 20, 30 - 20, 40, 40);
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = c.toDataURL('image/png');
}

/** Sets CSS custom properties to fabric textures so the DOM menus are textiles too. */
export function installCssTextures() {
  if (isNode) return;
  const root = document.documentElement.style;
  root.setProperty('--tex-felt-oat', `url(${tileURL('felt', PAL.oatmeal)})`);
  root.setProperty('--tex-felt-sage', `url(${tileURL('felt', PAL.sage)})`);
  root.setProperty('--tex-felt-rust', `url(${tileURL('felt', PAL.rust)})`);
  root.setProperty('--tex-felt-mustard', `url(${tileURL('felt', PAL.mustard)})`);
  root.setProperty('--tex-felt-rose', `url(${tileURL('felt', PAL.rose)})`);
  root.setProperty('--tex-felt-denim', `url(${tileURL('felt', PAL.denim)})`);
  root.setProperty('--tex-linen', `url(${tileURL('linen', PAL.linen)})`);
  root.setProperty('--tex-cork', `url(${corkURL()})`);
  root.setProperty('--tex-kraft', `url(${tileURL('felt', '#d9c29a', 96)})`);
  root.setProperty('--tex-tin', `url(${tileURL('linen', '#c9b9a0')})`);
  root.setProperty('--tex-gingham', `url(${tileURL('gingham', PAL.rose)})`);
  root.setProperty('--tex-denim', `url(${tileURL('denim', PAL.denim)})`);
}

function corkURL() {
  const c = makeCanvas(140, 140);
  const g = c.getContext('2d');
  g.fillStyle = '#c89a68';
  g.fillRect(0, 0, 140, 140);
  const rnd = mulberry32(99);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(90,55,25,0.22)' : 'rgba(255,230,190,0.16)';
    const r = 0.5 + rnd() * 1.8;
    g.beginPath();
    g.ellipse(rnd() * 140, rnd() * 140, r, r * (0.5 + rnd()), rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return c.toDataURL('image/png');
}
