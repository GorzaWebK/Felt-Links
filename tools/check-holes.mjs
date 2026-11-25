// npm run check:holes
//
// Proves every hole can be completed and that its par is fair, using the same
// simulation the game runs (see src/solver.js for how the robot golfer plays).
// A finish only counts if it still goes in with the aim 1 degree off or the
// power 2.5% off. Par is fair when
//   robot best <= par <= robot best + 1
// (the robot aims perfectly; one stroke of slack is left for people).
// It also checks today's and the next few daily holes.
//
// Options: --only=m1,s3   --daily=30 (number of daily holes)   --quick

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

async function jobList() {
  const { ALL_HOLES } = await import('../src/holes/index.js');
  const { dateKey } = await import('../src/rng.js');
  let list = ALL_HOLES.map((h) => ({ kind: 'course', id: h.id }));
  const nDaily = Number(args.daily ?? 10);
  const today = new Date();
  for (let i = 0; i < nDaily; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    list.push({ kind: 'daily', id: dateKey(d) });
  }
  if (args.only) {
    const want = String(args.only).split(',');
    list = list.filter((h) => want.includes(h.id));
  }
  return list;
}

async function workerMain() {
  const { solveHole } = await import('../src/solver.js');
  const { findHole } = await import('../src/holes/index.js');
  const { dailyHole } = await import('../src/holes/daily.js');
  for (const job of workerData.jobs) {
    const t0 = Date.now();
    let hole = null;
    let res;
    try {
      hole = job.kind === 'daily' ? dailyHole(job.id, { settlePar: true }) : findHole(job.id);
      res = solveHole(hole, { quick: workerData.quick });
    } catch (e) {
      res = { error: e.message };
    }
    parentPort.postMessage({ job, name: hole?.name, par: hole?.par, ms: Date.now() - t0, ...res });
  }
}

function verdict(r) {
  if (r.error) return { ok: false, text: `error: ${r.error}` };
  if (r.best == null) return { ok: false, text: `not completed within par+1 (${r.par + 1})` };
  if (r.best > r.par) return { ok: false, text: `par too tight: robot needs ${r.best}` };
  if (r.par > r.best + 1) return { ok: false, text: `par too generous: robot needs ${r.best}` };
  return { ok: true, text: r.par === r.best ? 'fair (tight)' : 'fair' };
}

async function main() {
  const list = await jobList();
  const n = Math.max(1, Math.min(list.length, (os.availableParallelism?.() ?? os.cpus().length) - 1));
  const buckets = Array.from({ length: n }, () => []);
  list.forEach((j, i) => buckets[i % n].push(j));
  const results = [];
  const t0 = Date.now();
  console.log(`Checking ${list.length} holes on ${n} threads${args.quick ? ' (quick)' : ''}...\n`);
  await Promise.all(
    buckets.map(
      (jobs) =>
        new Promise((resolve, reject) => {
          const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs, quick: !!args.quick } });
          w.on('message', (m) => {
            results.push(m);
            console.log(`  ${verdict(m).ok ? 'ok ' : 'BAD'} ${m.job.id.padEnd(10)} ${String(m.name).padEnd(20)} ${(m.ms / 1000).toFixed(1)}s`);
          });
          w.on('error', reject);
          w.on('exit', resolve);
        }),
    ),
  );

  const order = list.map((j) => j.id);
  results.sort((a, b) => order.indexOf(a.job.id) - order.indexOf(b.job.id));
  console.log('\n hole        name                  par  robot  lucky  hole-in-one  verdict');
  console.log(' ----------  --------------------  ---  -----  -----  -----------  -------');
  let bad = 0;
  for (const r of results) {
    const v = verdict(r);
    if (!v.ok) bad++;
    console.log(
      ` ${r.job.id.padEnd(10)}  ${String(r.name).padEnd(20)}  ${String(r.par).padStart(3)}  ${String(r.best ?? '-').padStart(5)}  ${String(r.any ?? '-').padStart(5)}  ${((r.hio || 0) * 100).toFixed(1).padStart(10)}%  ${v.text}`,
    );
  }
  console.log(`\n${results.length - bad}/${results.length} holes passed in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
  if (bad) process.exitCode = 1;
}

if (isMainThread) main();
else workerMain();
