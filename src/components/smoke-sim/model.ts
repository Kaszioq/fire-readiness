// Role C. Smoke transport model behind the smoke detection simulator (docs/SPEC.md module 6).
// An illustrative model, not a validated one: a side view (vertical slice) of a generic box module, not any real
// vehicle. Pure TypeScript on typed arrays, so it runs in the Web Worker (smoke.worker.ts) and in the vitest tests.
// Equations, assumptions and limits: README.md in this folder.

export type Wall = 'left' | 'right' | 'bottom' | 'top';

/** An opening in a wall. `pos` is its centre in metres along the wall: y on the side walls, x on floor and ceiling. */
export interface Opening {
  wall: Wall;
  pos: number;
}

/** Metres, origin at the bottom-left corner of the module, y pointing up (against gravity in the 1 g run). */
export interface Point {
  x: number;
  y: number;
}

export interface Detector extends Point {
  id: string;
}

export interface Layout {
  lengthM: number;
  heightM: number;
  inlet: Opening;
  outlet: Opening;
  fire: Point;
  detectors: Detector[];
}

export interface ModelParams {
  /** Air speed through the inlet, m/s. 0 switches the ventilation off. */
  inletSpeed: number;
  /** Eddy diffusivity standing in for turbulent mixing and fans, m^2/s. */
  mixing: number;
  /** 1 g only: upward drift of the hottest smoke next to the fire, m/s. */
  riseSpeed: number;
  /** 1 g only: time scale over which smoke loses its buoyancy, s. */
  coolingS: number;
  /** Alarm level in relative units (see MIX_TIME_S). */
  threshold: number;
}

export type GravityMode = '0g' | '1g';
export const GRAVITY_MODES: readonly GravityMode[] = ['0g', '1g'];

/** Cells along the module length. The height gets as many cells as keep them square (10 to 80). */
export const NX = 80;
/** Width of the inlet and of the outlet, m. */
export const OPENING_M = 0.4;
/** Simulated time per run, s. */
export const T_MAX_S = 300;
/** Concentration unit: 100 = the level the whole module would reach if this many seconds of smoke were mixed evenly, no ventilation. */
export const MIX_TIME_S = 60;
export const MAX_DETECTORS = 4;

// ---------- grid ----------

export interface Grid {
  nx: number;
  ny: number;
  dx: number;
  dy: number;
  lengthM: number;
  heightM: number;
}

export function makeGrid(lengthM: number, heightM: number): Grid {
  const nx = NX;
  const dx = lengthM / nx;
  const ny = Math.min(80, Math.max(10, Math.round(heightM / dx)));
  return { nx, ny, dx, dy: heightM / ny, lengthM, heightM };
}

export function isSideWall(wall: Wall): boolean {
  return wall === 'left' || wall === 'right';
}

export function wallLength(lengthM: number, heightM: number, wall: Wall): number {
  return isSideWall(wall) ? heightM : lengthM;
}

/** Cell containing a point, clamped to the module. */
export function cellOf(g: Grid, p: Point): number {
  const i = Math.min(g.nx - 1, Math.max(0, Math.floor(p.x / g.dx)));
  const j = Math.min(g.ny - 1, Math.max(0, Math.floor(p.y / g.dy)));
  return j * g.nx + i;
}

/** Indices (along the wall) of the boundary faces an opening covers. Always at least one. */
export function openingFaces(g: Grid, o: Opening): number[] {
  const n = isSideWall(o.wall) ? g.ny : g.nx;
  const h = isSideWall(o.wall) ? g.dy : g.dx;
  const faces: number[] = [];
  for (let m = 0; m < n; m++) if (Math.abs((m + 0.5) * h - o.pos) <= OPENING_M / 2 + 1e-9) faces.push(m);
  if (faces.length === 0) faces.push(Math.min(n - 1, Math.max(0, Math.floor(o.pos / h))));
  return faces;
}

// ---------- ventilation: potential flow from the inlet to the outlet ----------

export interface Flow {
  /** Velocity on the vertical faces, (nx + 1) * ny, row by row, +x positive, for an inlet speed of 1 m/s. */
  u: Float64Array;
  /** Velocity on the horizontal faces, nx * (ny + 1), row by row from the floor, +y positive. */
  v: Float64Array;
  /** Largest face speed, for an inlet speed of 1 m/s. */
  maxSpeed: number;
  /** True when the inlet covers the whole outlet, so no air can flow. */
  blocked: boolean;
  /** Velocity potential per cell; kept to warm-start the next solve while an opening is dragged. */
  phi: Float64Array;
}

/**
 * Solves Laplace's equation for the velocity potential on the cell grid (finite volumes, SOR), with the inlet and
 * outlet speeds as the only non-zero wall fluxes. The face velocities are the potential's gradient, so the field is
 * divergence-free to solver tolerance: what comes in through the inlet leaves through the outlet.
 */
export function solveFlow(g: Grid, inlet: Opening, outlet: Opening, warm?: Float64Array): Flow {
  const { nx, ny, dx, dy } = g;
  const n = nx * ny;
  const left = new Float64Array(ny);
  const right = new Float64Array(ny);
  const bottom = new Float64Array(nx);
  const top = new Float64Array(nx);
  const faces = (w: Wall) => (w === 'left' ? left : w === 'right' ? right : w === 'bottom' ? bottom : top);
  const inward = (w: Wall) => (w === 'left' || w === 'bottom' ? 1 : -1);
  const faceLen = (w: Wall) => (isSideWall(w) ? dy : dx);

  const inFaces = openingFaces(g, inlet);
  const outFaces = openingFaces(g, outlet).filter((m) => !(outlet.wall === inlet.wall && inFaces.includes(m)));
  const blocked = outFaces.length === 0;

  const u = new Float64Array((nx + 1) * ny);
  const v = new Float64Array(nx * (ny + 1));
  const phi = warm && warm.length === n ? Float64Array.from(warm) : new Float64Array(n);
  if (blocked) return { u, v, maxSpeed: 0, blocked, phi: new Float64Array(n) };

  for (const m of inFaces) faces(inlet.wall)[m] = inward(inlet.wall);
  const outSpeed = (inFaces.length * faceLen(inlet.wall)) / (outFaces.length * faceLen(outlet.wall));
  for (const m of outFaces) faces(outlet.wall)[m] = -inward(outlet.wall) * outSpeed;

  // Net outward wall flux of each cell (m^2/s). Sums to zero over the module.
  const wallFlux = new Float64Array(n);
  for (let j = 0; j < ny; j++) {
    wallFlux[j * nx] -= left[j] * dy;
    wallFlux[j * nx + nx - 1] += right[j] * dy;
  }
  for (let i = 0; i < nx; i++) {
    wallFlux[i] -= bottom[i] * dx;
    wallFlux[(ny - 1) * nx + i] += top[i] * dx;
  }

  // Cell balance: sum over interior faces of a * (phi_neighbour - phi) + wallFlux = 0.
  const ax = dy / dx;
  const ay = dx / dy;
  const omega = 2 / (1 + Math.sin(Math.PI / Math.max(nx, ny)));
  const tol = 1e-7 * Math.max(g.lengthM, g.heightM);
  for (let it = 0; it < 20000; it++) {
    let maxChange = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        let s = wallFlux[k];
        let a = 0;
        if (i > 0) {
          s += ax * phi[k - 1];
          a += ax;
        }
        if (i < nx - 1) {
          s += ax * phi[k + 1];
          a += ax;
        }
        if (j > 0) {
          s += ay * phi[k - nx];
          a += ay;
        }
        if (j < ny - 1) {
          s += ay * phi[k + nx];
          a += ay;
        }
        const d = s / a - phi[k];
        phi[k] += omega * d;
        if (d > maxChange) maxChange = d;
        else if (-d > maxChange) maxChange = -d;
      }
    }
    if (maxChange < tol) break;
  }

  let maxSpeed = 0;
  for (let j = 0; j < ny; j++) {
    const f = j * (nx + 1);
    u[f] = left[j];
    u[f + nx] = right[j];
    for (let i = 1; i < nx; i++) u[f + i] = (phi[j * nx + i] - phi[j * nx + i - 1]) / dx;
  }
  for (let i = 0; i < nx; i++) {
    v[i] = bottom[i];
    v[ny * nx + i] = top[i];
    for (let j = 1; j < ny; j++) v[j * nx + i] = (phi[j * nx + i] - phi[(j - 1) * nx + i]) / dy;
  }
  for (const x of u) maxSpeed = Math.max(maxSpeed, Math.abs(x));
  for (const x of v) maxSpeed = Math.max(maxSpeed, Math.abs(x));
  return { u, v, maxSpeed, blocked, phi };
}

/** Cell-centred ventilation velocity (m/s) for drawing arrows. */
export function cellVelocity(g: Grid, flow: Flow, inletSpeed: number): { ux: Float32Array; uy: Float32Array } {
  const { nx, ny } = g;
  const ux = new Float32Array(nx * ny);
  const uy = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      ux[k] = 0.5 * (flow.u[j * (nx + 1) + i] + flow.u[j * (nx + 1) + i + 1]) * inletSpeed;
      uy[k] = 0.5 * (flow.v[j * nx + i] + flow.v[(j + 1) * nx + i]) * inletSpeed;
    }
  }
  return { ux, uy };
}

// ---------- smoke transport ----------

function minmod(a: number, b: number): number {
  if (a * b <= 0) return 0;
  return Math.abs(a) < Math.abs(b) ? a : b;
}

/**
 * Advection-diffusion of smoke concentration on the grid, explicit finite volumes with a second-order upwind
 * (minmod-limited) scheme, so concentrations stay non-negative and smoke is conserved apart from the outlet.
 * In the 1 g run a second scalar, the excess heat of the smoke (0 to 1, held at 1 in the fire cell and cooling
 * with time scale `coolingS`), adds an upward drift of riseSpeed * heat. In the 0 g run there is no drift.
 */
export class SmokeModel {
  readonly g: Grid;
  readonly gravity: GravityMode;
  readonly dt: number;
  t = 0;
  /** Smoke concentration per cell, relative units. */
  readonly c: Float64Array;
  /** 1 g only: excess heat of the smoke per cell, 0 to 1. */
  private readonly heat: Float64Array | null;
  /** First time each detector reached the threshold, s; null while it has not. */
  readonly detectAt: (number | null)[];

  private readonly u: Float64Array;
  private readonly v: Float64Array;
  private readonly vTotal: Float64Array;
  private readonly fx: Float64Array;
  private readonly fy: Float64Array;
  private readonly next: Float64Array;
  private readonly fireCell: number;
  private readonly detectorCells: number[];
  private readonly emission: number;
  private readonly mixing: number;
  private readonly riseSpeed: number;
  private readonly coolFactor: number;
  private readonly threshold: number;

  constructor(g: Grid, flow: Flow, layout: Layout, params: ModelParams, gravity: GravityMode) {
    this.g = g;
    this.gravity = gravity;
    const n = g.nx * g.ny;
    this.c = new Float64Array(n);
    this.next = new Float64Array(n);
    this.fx = new Float64Array((g.nx + 1) * g.ny);
    this.fy = new Float64Array(g.nx * (g.ny + 1));
    const speed = flow.blocked ? 0 : Math.max(0, params.inletSpeed);
    this.u = flow.u.map((x) => x * speed);
    this.v = flow.v.map((x) => x * speed);
    this.vTotal = new Float64Array(this.v.length);
    this.mixing = Math.max(0, params.mixing);
    this.riseSpeed = gravity === '1g' ? Math.max(0, params.riseSpeed) : 0;
    this.threshold = params.threshold;
    this.fireCell = cellOf(g, layout.fire);
    this.detectorCells = layout.detectors.map((d) => cellOf(g, d));
    this.detectAt = layout.detectors.map(() => null);
    // Constant emission so that MIX_TIME_S seconds of smoke mixed through the module give 100 units.
    this.emission = (100 * g.lengthM * g.heightM) / MIX_TIME_S;

    const ventMax = flow.blocked ? 0 : flow.maxSpeed * speed;
    const rate =
      2 * (ventMax / g.dx + (ventMax + this.riseSpeed) / g.dy) + 2 * this.mixing * (1 / g.dx ** 2 + 1 / g.dy ** 2);
    this.dt = Math.min(0.25, rate > 0 ? 0.8 / rate : 0.25);
    this.coolFactor = Math.exp(-this.dt / Math.max(0.1, params.coolingS));

    this.heat = gravity === '1g' ? new Float64Array(n) : null;
    if (this.heat) this.heat[this.fireCell] = 1;
  }

  /** Total smoke in the module (relative units times m^2), for the conservation test. */
  total(): number {
    let s = 0;
    for (const x of this.c) s += x;
    return s * this.g.dx * this.g.dy;
  }

  emissionRate(): number {
    return this.emission;
  }

  private transport(c: Float64Array, v: Float64Array): void {
    const { nx, ny, dx, dy } = this.g;
    const { u, fx, fy, next } = this;
    const D = this.mixing;

    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      const f0 = j * (nx + 1);
      // Walls carry no flux; an inflow face brings clean air; an outflow face carries the cell's smoke out.
      const vl = u[f0];
      fx[f0] = vl < 0 ? vl * c[row] * dy : 0;
      const vr = u[f0 + nx];
      fx[f0 + nx] = vr > 0 ? vr * c[row + nx - 1] * dy : 0;
      for (let i = 1; i < nx; i++) {
        const kL = row + i - 1;
        const kR = kL + 1;
        const vel = u[f0 + i];
        let cf: number;
        if (vel >= 0) {
          const a = c[kL];
          cf = a + 0.5 * minmod(a - (i > 1 ? c[kL - 1] : a), c[kR] - a);
        } else {
          const a = c[kR];
          cf = a + 0.5 * minmod(a - (i < nx - 1 ? c[kR + 1] : a), c[kL] - a);
        }
        fx[f0 + i] = (vel * cf - (D * (c[kR] - c[kL])) / dx) * dy;
      }
    }

    for (let i = 0; i < nx; i++) {
      const vb = v[i];
      fy[i] = vb < 0 ? vb * c[i] * dx : 0;
      const vt = v[ny * nx + i];
      fy[ny * nx + i] = vt > 0 ? vt * c[(ny - 1) * nx + i] * dx : 0;
    }
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const f = j * nx + i;
        const kB = f - nx;
        const kT = f;
        const vel = v[f];
        let cf: number;
        if (vel >= 0) {
          const a = c[kB];
          cf = a + 0.5 * minmod(a - (j > 1 ? c[kB - nx] : a), c[kT] - a);
        } else {
          const a = c[kT];
          cf = a + 0.5 * minmod(a - (j < ny - 1 ? c[kT + nx] : a), c[kB] - a);
        }
        fy[f] = (vel * cf - (D * (c[kT] - c[kB])) / dy) * dx;
      }
    }

    const k0 = this.dt / (dx * dy);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const f = j * (nx + 1) + i;
        const val = c[k] + k0 * (fx[f] - fx[f + 1] + fy[k] - fy[k + nx]);
        next[k] = val > 0 ? val : 0;
      }
    }
    c.set(next);
  }

  step(): void {
    const { nx, ny, dx, dy } = this.g;
    const before = this.detectorCells.map((k) => this.c[k]);

    if (this.heat) {
      // Drift on each horizontal face from the heat of the cell below it (upwind: the drift always points up).
      const vt = this.vTotal;
      const heat = this.heat;
      vt.set(this.v);
      for (let j = 1; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const h = heat[(j - 1) * nx + i];
          vt[j * nx + i] += this.riseSpeed * (h < 1 ? h : 1);
        }
      }
      this.transport(heat, vt);
      for (let k = 0; k < heat.length; k++) {
        const h = heat[k] * this.coolFactor;
        heat[k] = h < 1 ? h : 1;
      }
      heat[this.fireCell] = 1;
      this.transport(this.c, vt);
    } else {
      this.transport(this.c, this.v);
    }

    this.c[this.fireCell] += (this.dt * this.emission) / (dx * dy);
    const t0 = this.t;
    this.t += this.dt;

    for (let d = 0; d < this.detectorCells.length; d++) {
      if (this.detectAt[d] !== null) continue;
      const now = this.c[this.detectorCells[d]];
      if (now >= this.threshold) {
        const prev = before[d];
        const frac = now > prev ? Math.min(1, Math.max(0, (this.threshold - prev) / (now - prev))) : 1;
        this.detectAt[d] = t0 + frac * this.dt;
      }
    }
  }

  /** Steps until time `target` (or T_MAX_S). Stops early and returns false once `deadline` (performance.now()) passes. */
  advanceTo(target: number, deadline = Infinity): boolean {
    const end = Math.min(target, T_MAX_S);
    while (this.t < end - 1e-9) {
      this.step();
      if (performance.now() > deadline) return this.t >= end - 1e-9;
    }
    return true;
  }

  get done(): boolean {
    return this.t >= T_MAX_S - 1e-9;
  }
}

// ---------- messages between SmokeSim.tsx and smoke.worker.ts ----------

export type WorkerIn =
  | { type: 'setup'; layout: Layout; params: ModelParams }
  /** Simulated seconds per real second; Infinity runs as fast as the CPU allows. */
  | { type: 'play'; speed: number }
  | { type: 'pause' };

export interface FlowMessage {
  type: 'flow';
  nx: number;
  ny: number;
  ux: Float32Array;
  uy: Float32Array;
  blocked: boolean;
}

export interface FrameMessage {
  type: 'frame';
  nx: number;
  ny: number;
  t: number;
  /** Concentration fields in GRAVITY_MODES order. */
  fields: Float32Array[];
  /** Detection times per mode, in the order of layout.detectors. */
  detect: (number | null)[][];
  done: boolean;
  playing: boolean;
}

export type WorkerOut = FlowMessage | FrameMessage;
