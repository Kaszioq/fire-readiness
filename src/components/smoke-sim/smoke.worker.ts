// Role C. Web Worker for the smoke simulator: runs the 0 g and the 1 g model side by side off the main thread
// and posts the concentration fields about 30 times a second. SmokeSim.tsx only draws them.
import {
  cellVelocity,
  GRAVITY_MODES,
  makeGrid,
  SmokeModel,
  solveFlow,
  T_MAX_S,
  type Flow,
  type Layout,
  type ModelParams,
  type WorkerIn,
  type WorkerOut,
} from './model';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
  postMessage(message: WorkerOut, options?: { transfer?: Transferable[] }): void;
};

const FRAME_MS = 33;
const BUDGET_MS = 26; // compute time per frame; a slow machine runs slower than the chosen speed instead of freezing

let models: SmokeModel[] = [];
let flow: Flow | null = null;
let flowKey = '';
let playing = false;
let speed = 5;
let last = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { layout: Layout; params: ModelParams } | null = null;

function simTime(): number {
  return models.length ? Math.min(T_MAX_S, ...models.map((m) => m.t)) : 0;
}

function allDone(): boolean {
  return models.length > 0 && models.every((m) => m.done);
}

function postFrame() {
  if (!models.length) return;
  const g = models[0].g;
  const fields = models.map((m) => Float32Array.from(m.c));
  ctx.postMessage(
    {
      type: 'frame',
      nx: g.nx,
      ny: g.ny,
      t: simTime(),
      fields,
      detect: models.map((m) => [...m.detectAt]),
      done: allDone(),
      playing,
    },
    { transfer: fields.map((f) => f.buffer) },
  );
}

function setup({ layout, params }: { layout: Layout; params: ModelParams }) {
  const g = makeGrid(layout.lengthM, layout.heightM);
  const key = JSON.stringify([layout.lengthM, layout.heightM, layout.inlet, layout.outlet]);
  if (!flow || key !== flowKey) {
    flow = solveFlow(g, layout.inlet, layout.outlet, flow?.phi);
    flowKey = key;
  }
  models = GRAVITY_MODES.map((mode) => new SmokeModel(g, flow as Flow, layout, params, mode));
  const { ux, uy } = cellVelocity(g, flow, flow.blocked ? 0 : params.inletSpeed);
  ctx.postMessage({ type: 'flow', nx: g.nx, ny: g.ny, ux, uy, blocked: flow.blocked }, { transfer: [ux.buffer, uy.buffer] });
  postFrame();
}

function schedule() {
  if (timer === null && playing) timer = setTimeout(tick, FRAME_MS);
}

function tick() {
  timer = null;
  if (!playing || !models.length) return;
  const now = performance.now();
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  const deadline = now + BUDGET_MS;
  const start = simTime();
  const target = Number.isFinite(speed) ? Math.min(T_MAX_S, start + speed * elapsed) : T_MAX_S;
  // Small slices, alternating between the models, so both stay at the same time if the budget runs out.
  for (let sub = Math.min(target, start + 0.5); ; sub = Math.min(target, sub + 0.5)) {
    let finished = true;
    for (const m of models) finished = m.advanceTo(sub, deadline) && finished;
    if (!finished || performance.now() > deadline || sub >= target) break;
  }
  if (allDone()) playing = false;
  postFrame();
  schedule();
}

function flushPending() {
  const job = pending;
  pending = null;
  if (job) setup(job);
}

ctx.onmessage = (e) => {
  const msg = e.data;
  // A play or pause right after a setup (the Restart button) applies to the new setup.
  if (msg.type !== 'setup') flushPending();
  if (msg.type === 'setup') {
    // While a marker is dragged, setups arrive faster than they are needed: keep only the latest.
    const first = pending === null;
    pending = { layout: msg.layout, params: msg.params };
    if (first) setTimeout(flushPending, 0);
  } else if (msg.type === 'play') {
    speed = msg.speed;
    if (allDone()) {
      playing = false;
      postFrame();
      return;
    }
    if (!playing) last = performance.now();
    playing = true;
    schedule();
  } else if (msg.type === 'pause') {
    playing = false;
    postFrame();
  }
};
