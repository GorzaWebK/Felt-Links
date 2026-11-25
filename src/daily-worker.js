// Settles the daily hole's par off the main thread (the ace search takes a few seconds).
import { dailyHole } from './holes/daily.js';

self.onmessage = (e) => {
  const key = e.data;
  const hole = dailyHole(key, { settlePar: true });
  self.postMessage({ key, par: hole.par });
};
