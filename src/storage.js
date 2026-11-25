// Progress, best scores, daily results, settings and key bindings, saved in localStorage.
// Every access is wrapped: private windows and blocked storage fall back to memory.

const KEY = 'felt-links.v1';

export const DEFAULT_SETTINGS = {
  music: 0.6,
  sfx: 0.8,
  muted: false,
  reducedMotion: false,
  largeText: false,
  aimGuide: true,
  hazardPatterns: true,
};

export const DEFAULT_BINDINGS = {
  aimLeft: 'ArrowLeft',
  aimRight: 'ArrowRight',
  powerUp: 'ArrowUp',
  powerDown: 'ArrowDown',
  shoot: 'Space',
  fine: 'ShiftLeft',
  overview: 'KeyO',
  restart: 'KeyR',
  pause: 'KeyP',
  mute: 'KeyM',
};

function blank() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    bindings: { ...DEFAULT_BINDINGS },
    holes: {}, // id -> { best, thimbles }
    daily: {}, // date -> { best, plays }
    seenIntro: false,
  };
}

let memory = null;

function load() {
  if (memory) return memory;
  let data = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = {
        ...data,
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        bindings: { ...DEFAULT_BINDINGS, ...(parsed.bindings || {}) },
      };
    }
  } catch {
    /* storage unavailable or corrupt: start fresh in memory */
  }
  memory = data;
  return data;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* ignore: progress just lives in memory this session */
  }
}

export const store = {
  get data() {
    return load();
  },
  settings() {
    return load().settings;
  },
  setSetting(key, value) {
    load().settings[key] = value;
    save();
  },
  bindings() {
    return load().bindings;
  },
  setBinding(action, code) {
    const b = load().bindings;
    // A key can only do one thing: swap with whatever action had it.
    for (const k of Object.keys(b)) if (b[k] === code && k !== action) b[k] = b[action];
    b[action] = code;
    save();
  },
  resetBindings() {
    load().bindings = { ...DEFAULT_BINDINGS };
    save();
  },
  hole(id) {
    return load().holes[id] || null;
  },
  /** Records a finished hole; returns { best, thimbles, newBest }. */
  recordHole(id, strokes, thimbles) {
    const h = load().holes;
    const prev = h[id];
    const newBest = !prev || strokes < prev.best;
    h[id] = {
      best: prev ? Math.min(prev.best, strokes) : strokes,
      thimbles: prev ? Math.max(prev.thimbles, thimbles) : thimbles,
    };
    save();
    return { ...h[id], newBest };
  },
  daily(date) {
    return load().daily[date] || null;
  },
  recordDaily(date, strokes) {
    const d = load().daily;
    const prev = d[date];
    const newBest = !prev || strokes < prev.best;
    d[date] = { best: prev ? Math.min(prev.best, strokes) : strokes, plays: (prev?.plays || 0) + 1 };
    save();
    return { ...d[date], newBest };
  },
  /** Cached settled par for one date (only the latest date is kept). */
  dailyPar(date) {
    const c = load().dailyPar;
    return c && c.date === date ? c.par : null;
  },
  setDailyPar(date, par) {
    load().dailyPar = { date, par };
    save();
  },
  markIntroSeen() {
    load().seenIntro = true;
    save();
  },
  resetProgress() {
    const keep = load();
    memory = { ...blank(), settings: keep.settings, bindings: keep.bindings };
    save();
  },
};
