// Start-up, the game loop and the flow of a round.

import './style.css';
import { DT } from './physics.js';
import { buildWorld, resetBall, shoot, step } from './sim.js';
import { COURSES, UNLOCK_THIMBLES, courseThimbles, courseUnlocked, thimblesFor } from './holes/index.js';
import { dailyHole } from './holes/daily.js';
import { dateKey } from './rng.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { store } from './storage.js';
import { ui } from './ui.js';
import { installCssTextures, makeFavicon } from './art.js';

const OUT_TEXT = {
  water: 'Into the felt water! +1 stroke',
  pins: 'Snagged on the pins! +1 stroke',
  table: 'Off the edge of the quilt! +1 stroke',
  stuck: 'Tangled up. +1 stroke',
};
const INTRO_TEXT = {
  satin: 'new: satin',
  corduroy: 'new: corduroy',
  band: 'new: elastic bands',
  water: 'new: felt water',
  denim: 'new: denim',
  button: 'new: spinning buttons',
  zip: 'new: zips',
  ribbon: 'new: ribbon bridges',
  pins: 'new: pincushions',
  needle: 'new: the sewing machine',
  reel: 'new: cotton reels',
  thread: 'new: loose threads',
  fan: 'new: the hand fan',
};

const game = {
  mode: 'menu', // menu | play | pause | card
  phase: 'intro', // intro | aim | moving | sinking | out
  hole: null,
  world: null,
  round: null, // { course, start, scores: [] }
  daily: null,
  acc: 0,
  phaseT: 0,
  introT: null,
  transition: null,
  outReason: null,
  firstShotHint: false,
};

const canvas = document.getElementById('view');
const renderer = new Renderer(canvas);

const input = new Input(canvas, {
  mode: () => (ui.open ? 'menu' : game.mode === 'play' ? 'play' : 'none'),
  canAim: () => game.mode === 'play' && game.phase === 'aim' && game.world?.ball.state === 'rest' && game.transition == null,
  shoot: (angle, power) => takeShot(angle, power),
  aimChanged: () => {},
  action: (a) => hudAction(a),
  nav: (d) => ui.nav(d),
  activate: () => ui.activate(),
  back: () => ui.back(),
});

// ------------------------------------------------------------ settings

function applySettings() {
  const s = store.settings();
  audio.setVolumes(s.music, s.sfx, s.muted);
  document.body.classList.toggle('large-text', !!s.largeText);
  document.body.classList.toggle('reduced-motion', !!s.reducedMotion);
  renderer.settings = s;
}

function toggleMute() {
  const m = !store.settings().muted;
  store.setSetting('muted', m);
  applySettings();
  ui.toast(m ? 'Sound off (M)' : 'Sound on (M)', 1200);
  const t = document.querySelector('[data-key="muted"]');
  if (t) t.setAttribute('aria-pressed', String(m));
}

// ------------------------------------------------------------ holes and rounds

function courseOf(hole) {
  return COURSES.find((c) => c.id === hole.course);
}

function loadHole(hole) {
  game.hole = hole;
  game.world = buildWorld(hole);
  game.phase = 'intro';
  game.phaseT = 0;
  game.introT = 0;
  game.outReason = null;
  renderer.setWorld(game.world, store.settings());
  const cup = game.world.cup;
  input.setAimTowards(cup.x > hole.tee[0] ? 0.62 : Math.PI - 0.62);
  ui.hudShow(hole, courseOf(hole)?.name || '');
  ui.hudIntro(hole, INTRO_TEXT[hole.intro]);
  ui.hudPower(null);
  audio.playTheme(hole.theme);
  if (!store.data.seenIntro && !hole.daily && hole.number === 1) {
    game.firstShotHint = true;
    ui.hudHint(input.lastDevice === 'touch' ? 'press anywhere and pull back to aim, then let go' : 'drag back from anywhere to aim, or use ← → ↑ ↓ and Space');
  } else ui.hudHint(null);
}

function startRound(courseIdx, holeIdx) {
  if (!courseUnlocked(courseIdx, store)) return;
  const c = COURSES[courseIdx];
  game.daily = null;
  game.round = { course: courseIdx, start: holeIdx, index: holeIdx, scores: Array(c.holes.length).fill(null), thimbles: Array(c.holes.length).fill(0) };
  ui.hide();
  game.mode = 'play';
  withTransition(() => loadHole(c.holes[holeIdx]));
}

/**
 * Today's hole. Its par is settled once by a background worker (a quick robot
 * search for a repeatable hole-in-one) and remembered on the device; until then
 * the generator's own estimate is shown.
 */
let parWorker = null;
function todaysHole() {
  const key = dateKey();
  const known = store.dailyPar(key);
  if (!known && !parWorker && typeof Worker !== 'undefined') {
    try {
      parWorker = new Worker(new URL('./daily-worker.js', import.meta.url), { type: 'module' });
      parWorker.onmessage = (e) => {
        const { key: k, par } = e.data;
        store.setDailyPar(k, par);
        parWorker.terminate();
        parWorker = null;
        if (game.hole?.daily === k && game.hole.par !== par) {
          game.hole.par = par;
          ui.hudShow(game.hole, '');
          ui.hudStrokes(game.world.strokes, par);
        }
        if (ui.current === 'menu') ui.show('menu');
      };
      parWorker.postMessage(key);
    } catch {
      parWorker = null;
    }
  }
  return dailyHole(key, known ? { knownPar: known } : {});
}

function startDaily() {
  const hole = todaysHole();
  game.daily = { key: hole.daily };
  game.round = null;
  ui.hide();
  game.mode = 'play';
  withTransition(() => loadHole(hole));
}

function dailyInfo() {
  const h = todaysHole();
  return { name: h.name, par: h.par, best: store.daily(h.daily)?.best };
}

function withTransition(swap) {
  if (game.world == null) {
    swap();
    game.transition = store.settings().reducedMotion ? null : 1;
    return;
  }
  game.transition = 0;
  game.pendingSwap = swap;
}

function takeShot(angle, power) {
  if (!input.h.canAim()) return;
  shoot(game.world, angle, power);
  audio.play('shot', { power });
  game.phase = 'moving';
  game.phaseT = 0;
  ui.hudStrokes(game.world.strokes, game.hole.par);
  ui.hudPower(null);
  if (game.firstShotHint) {
    game.firstShotHint = false;
    store.markIntroSeen();
    ui.hudHint(null);
  }
}

function finishHole() {
  const hole = game.hole;
  const strokes = game.world.strokes;
  const th = thimblesFor(strokes, hole.par);
  game.mode = 'card';
  ui.hudPower(null);
  const diff = strokes - hole.par;
  const word = strokes === 1 ? 'HOLE IN ONE' : diff <= -2 ? 'EAGLE' : diff === -1 ? 'BIRDIE' : diff === 0 ? 'PAR' : diff === 1 ? 'BOGEY' : `+${diff}`;
  if (hole.daily) {
    const rec = store.recordDaily(hole.daily, strokes);
    ui.show('card', {
      title: 'DAILY HOLE',
      rows: [{ label: 'D', par: hole.par, strokes, thimbles: th }],
      highlight: 0,
      footer: word,
      thimbles: th,
      label: `Daily hole: ${strokes} strokes, par ${hole.par}`,
      note: rec.newBest && rec.plays > 1 ? `a new best for ${hole.daily}!` : `best today: ${rec.best} · same hole for everyone on ${hole.daily}`,
      actions: [
        { act: 'replay', label: 'Play it again' },
        { act: 'quit', label: 'Back to the pattern' },
      ],
    });
    return;
  }
  const r = game.round;
  const c = COURSES[r.course];
  const before = courseUnlocked(r.course + 1, store);
  const rec = store.recordHole(hole.id, strokes, th);
  r.scores[r.index] = strokes;
  r.thimbles[r.index] = th;
  const nowOpen = r.course + 1 < COURSES.length && !before && courseUnlocked(r.course + 1, store);
  const last = r.index >= c.holes.length - 1;
  const actions = last
    ? [{ act: 'quit', label: 'Back to the corkboard' }, { act: 'replay', label: 'Replay this hole' }]
    : [{ act: 'next', label: `On to hole ${r.index + 2} →` }, { act: 'replay', label: 'Replay this hole' }];
  let note = rec.newBest ? 'a new best for this hole!' : `your best here: ${rec.best}`;
  if (nowOpen) note = `${COURSES[r.course + 1].name} is unlocked!`;
  else if (last) note = `round done · ${courseThimbles(c, store)} / 27 thimbles in ${c.name}`;
  ui.show('card', roundCard(r, r.index, word, th, note, actions));
}

function roundCard(r, highlight, footer, th, note, actions) {
  const c = COURSES[r.course];
  return {
    title: c.name,
    rows: c.holes.map((h, i) => ({ label: i + 1, par: h.par, strokes: r.scores[i], thimbles: r.thimbles[i] })),
    highlight,
    footer,
    thimbles: th,
    note,
    label: `${c.name} scorecard`,
    actions,
  };
}

function nextHole() {
  const r = game.round;
  if (!r) return quit();
  r.index++;
  const c = COURSES[r.course];
  if (r.index >= c.holes.length) return quit();
  ui.hide();
  game.mode = 'play';
  withTransition(() => loadHole(c.holes[r.index]));
}

function replayHole() {
  ui.hide();
  game.mode = 'play';
  withTransition(() => loadHole(game.hole));
}

function restartHole() {
  if (ui.current === 'pause') ui.hide();
  game.mode = 'play';
  loadHole(game.hole);
}

function skipHole() {
  const r = game.round;
  ui.hide();
  game.mode = 'play';
  if (!r) return quit();
  r.scores[r.index] = null;
  nextHole();
}

function quit() {
  game.mode = 'menu';
  ui.hudHide();
  audio.setWhirr(0);
  audio.playTheme('menu');
  if (game.daily || !game.round) ui.show('menu');
  else ui.show('courses', { course: game.round.course });
  game.daily = null;
}

function pause(fromSettings = false) {
  if (game.mode !== 'play' && !fromSettings) return;
  game.mode = 'pause';
  input.drag = null;
  ui.hudPower(null);
  const h = game.hole;
  ui.show('pause', {
    where: h.daily ? `today's hole · ${h.name}` : `${courseOf(h).name} · hole ${h.number} · stroke ${game.world.strokes}`,
    canSkip: !!game.round && game.world.strokes >= h.par + 3,
    daily: !!h.daily,
  });
}

function resume() {
  ui.hide();
  game.mode = 'play';
}

function showRoundCard() {
  if (!game.round) return;
  const r = game.round;
  ui.show('card', roundCard(r, null, null, null, 'the round so far', [{ act: 'resume', label: 'Back to the hole' }]));
}

function hudAction(a) {
  switch (a) {
    case 'mute':
      return toggleMute();
    case 'pause':
      return game.mode === 'play' ? pause() : undefined;
    case 'restart':
      return game.mode === 'play' ? restartHole() : undefined;
    case 'overview':
      if (game.mode === 'play') renderer.setOverview(!renderer.overview);
      return undefined;
    default:
      return undefined;
  }
}

// ------------------------------------------------------------ events

function handleEvents() {
  const w = game.world;
  for (const e of w.events) {
    renderer.onEvent(e);
    switch (e.type) {
      case 'hit':
        if (e.speed > 60) audio.play('thud', { speed: e.speed, surf: e.surf });
        break;
      case 'ridge':
        audio.play('ridge');
        break;
      case 'plip':
        audio.play('plip', e);
        break;
      case 'twang':
        audio.play('twang', e);
        break;
      case 'tink':
        audio.play('tink');
        break;
      case 'zip':
        audio.play('zip');
        break;
      case 'snag':
        audio.play('snag');
        break;
      case 'out':
        audio.play(e.reason === 'water' ? 'splash' : e.reason === 'pins' ? 'prick' : 'out');
        game.phase = 'out';
        game.phaseT = 0;
        game.outReason = e.reason;
        ui.toast(OUT_TEXT[e.reason] || OUT_TEXT.stuck);
        break;
      case 'sunk':
        audio.play('pop');
        game.phase = 'sinking';
        game.phaseT = 0;
        break;
      default:
        break;
    }
  }
  w.events.length = 0;
}

// ------------------------------------------------------------ loop

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  input.update(dt);

  if (game.transition != null) {
    game.transition += dt / 0.55;
    if (game.transition >= 1 && game.pendingSwap) {
      game.pendingSwap();
      game.pendingSwap = null;
      game.transition = 1;
    }
    if (game.transition >= 2) game.transition = null;
  }

  const w = game.world;
  if (w && game.mode !== 'pause' && game.transition == null) {
    game.acc += dt;
    let n = 0;
    while (game.acc >= DT && n < 14) {
      step(w);
      game.acc -= DT;
      n++;
    }
    if (n >= 14) game.acc = 0;
    if (game.mode === 'play') handleEvents();
    else w.events.length = 0;
    game.phaseT += dt;
    if (game.phase === 'intro') {
      game.introT = Math.min(1, game.phaseT / 1.4);
      if (game.phaseT > 1.4 && w.ball.state === 'rest') {
        game.phase = 'aim';
        game.introT = null;
      }
    } else if (game.phase === 'moving' && w.ball.state === 'rest') {
      game.phase = 'aim';
    } else if (game.phase === 'aim' && w.ball.state === 'moving') {
      game.phase = 'moving'; // nudged by the needle or the wind
      input.drag = null;
    } else if (game.phase === 'out' && game.phaseT > 0.9) {
      w.strokes += 1;
      ui.hudStrokes(w.strokes, game.hole.par);
      resetBall(w);
      game.phase = 'moving';
    } else if (game.phase === 'sinking' && game.phaseT > 1.1 && game.mode === 'play') {
      finishHole();
    }
  }

  // Sewing machine whirr, louder near the needle.
  if (w && game.mode === 'play') {
    let lvl = 0;
    for (const b of w.bodies) if (b.type === 'needle') lvl = Math.max(lvl, 1 - Math.abs(w.ball.x - b.x) / 800);
    audio.setWhirr(Math.max(0, lvl));
  } else audio.setWhirr(0);

  // Camera.
  if (w) {
    const aim = input.currentAim();
    const b = w.ball;
    let fx = b.x;
    let fy = b.y - 60;
    if (game.phase === 'aim' && aim) {
      fx += Math.cos(aim.angle) * aim.power * 260;
      fy -= Math.sin(aim.angle) * aim.power * 140;
    }
    if (game.phase === 'intro') {
      // Glance from the cup back to the tee as the hole opens.
      const k = Math.min(1, game.phaseT / 1.2);
      const e = k * k * (3 - 2 * k);
      fx = w.cup.x + (b.x - w.cup.x) * e;
    }
    if (game.phase === 'sinking') fx = w.cup.x;
    renderer.updateCamera(dt, { x: fx, y: fy });
    const showAim = game.mode === 'play' && game.phase === 'aim' && aim;
    const aimGuide = store.settings().aimGuide;
    ui.hudPower(showAim ? aim.power : null);
    renderer.frame(dt, {
      aim: showAim ? (aimGuide ? aim : { ...aim, power: Math.min(aim.power, 0.12) }) : null,
      pull: showAim ? aim.pull : null,
      sinkT: game.phase === 'sinking' ? game.phaseT : null,
      outT: game.phase === 'out' ? game.phaseT : null,
      intro: game.mode === 'play' && game.introT != null ? game.introT : null,
      transition: game.transition,
    });
  } else renderer.frame(dt, {});
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------ boot

function demoWorld() {
  // A hole behind the main menu so the envelope sits on a live diorama.
  const h = COURSES[0].holes[0];
  game.hole = h;
  game.world = buildWorld(h);
  renderer.setWorld(game.world, store.settings());
}

async function boot() {
  installCssTextures();
  makeFavicon();
  applySettings();
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fonts are optional */
  }
  ui.init({
    input,
    startRound,
    startDaily,
    dailyInfo,
    applySettings,
    resume,
    pause,
    restartHole,
    showRoundCard: () => {
      showRoundCard();
    },
    skipHole,
    quit,
    nextHole,
    replayHole,
    hudAction,
  });
  demoWorld();
  ui.show('menu');
  audio.playTheme('menu');
  const unlock = () => {
    audio.unlock();
    applySettings();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'play') pause();
  });
  requestAnimationFrame(frame);
  // Testing helpers.
  window.feltLinks = { game, renderer, input, store, startRound, startDaily, shoot: takeShot, UNLOCK_THIMBLES };
}

boot();
