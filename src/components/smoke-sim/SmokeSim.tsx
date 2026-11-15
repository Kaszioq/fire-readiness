'use client';

// Role C. Smoke detection simulator (docs/SPEC.md module 6). An illustrative model, not a validated one.
// One generic module, one fire, the same vents and detectors, simulated twice side by side: in microgravity and in
// 1 g. The model runs in a Web Worker (smoke.worker.ts); this component draws the fields on canvas and handles the
// controls. Self-contained: role B only places <SmokeSim /> on a page. Equations and limits: README.md here.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { SmokeSimProps, SmokeSimResult } from '@/lib/types';
import {
  GRAVITY_MODES,
  isSideWall,
  MAX_DETECTORS,
  MIX_TIME_S,
  OPENING_M,
  T_MAX_S,
  wallLength,
  type FlowMessage,
  type FrameMessage,
  type GravityMode,
  type Layout,
  type ModelParams,
  type Opening,
  type Point,
  type Wall,
  type WorkerIn,
  type WorkerOut,
} from './model';

// Starting layout and settings. Chosen for illustration, not taken from any vehicle or measurement.
const DEFAULT_LAYOUT: Layout = {
  lengthM: 6,
  heightM: 3,
  inlet: { wall: 'left', pos: 2.4 },
  outlet: { wall: 'right', pos: 0.6 },
  fire: { x: 1.8, y: 0.2 },
  detectors: [
    { id: 'D1', x: 2.4, y: 2.9 },
    { id: 'D2', x: 5.85, y: 0.9 },
    { id: 'D3', x: 4.5, y: 2.9 },
  ],
};
const DEFAULT_PARAMS: ModelParams = { inletSpeed: 0.2, mixing: 0.01, riseSpeed: 0.5, coolingS: 20, threshold: 5 };
const SPEEDS = [1, 5, 20];
const DEFAULT_SPEED = 5;
const DETECTOR_IDS = ['D1', 'D2', 'D3', 'D4'];
const EDGE_M = 0.05; // markers stay this far inside the walls
const HIT_PX = 22; // pointer distance that still grabs a marker

const MODE_INFO: Record<GravityMode, { title: string; note: string }> = {
  '0g': { title: 'Microgravity (0 g)', note: 'No buoyancy: smoke moves only with the air flow and by mixing.' },
  '1g': { title: 'Normal gravity (1 g)', note: 'Hot smoke rises from the fire and slows as it cools.' },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const seconds = (t: number) => (Number.isFinite(t) ? `${t.toFixed(1)} s` : 'n/a');

// ---------- layout helpers ----------

function openingPoint(l: Layout, o: Opening): Point {
  if (o.wall === 'left') return { x: 0, y: o.pos };
  if (o.wall === 'right') return { x: l.lengthM, y: o.pos };
  if (o.wall === 'bottom') return { x: o.pos, y: 0 };
  return { x: o.pos, y: l.heightM };
}

function markers(l: Layout): { key: string; p: Point }[] {
  return [
    { key: 'fire', p: l.fire },
    { key: 'inlet', p: openingPoint(l, l.inlet) },
    { key: 'outlet', p: openingPoint(l, l.outlet) },
    ...l.detectors.map((d) => ({ key: d.id, p: { x: d.x, y: d.y } })),
  ];
}

function clampInside(l: Pick<Layout, 'lengthM' | 'heightM'>, p: Point): Point {
  return { x: clamp(p.x, EDGE_M, l.lengthM - EDGE_M), y: clamp(p.y, EDGE_M, l.heightM - EDGE_M) };
}

/** Moves an opening to the wall nearest the point, keeping it clear of the other opening. */
function snapToWall(l: Layout, p: Point, other: Opening, prev: Opening): Opening {
  const dist: [Wall, number][] = [
    ['left', p.x],
    ['right', l.lengthM - p.x],
    ['bottom', p.y],
    ['top', l.heightM - p.y],
  ];
  const wall = dist.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  const len = wallLength(l.lengthM, l.heightM, wall);
  const half = OPENING_M / 2;
  let pos = clamp(isSideWall(wall) ? p.y : p.x, half, len - half);
  if (other.wall === wall && Math.abs(pos - other.pos) < OPENING_M) {
    pos = pos < other.pos ? other.pos - OPENING_M : other.pos + OPENING_M;
    if (pos < half || pos > len - half) return prev;
  }
  return { wall, pos };
}

function moveMarker(l: Layout, key: string, p: Point): Layout {
  if (key === 'fire') return { ...l, fire: clampInside(l, p) };
  if (key === 'inlet') return { ...l, inlet: snapToWall(l, p, l.outlet, l.inlet) };
  if (key === 'outlet') return { ...l, outlet: snapToWall(l, p, l.inlet, l.outlet) };
  return { ...l, detectors: l.detectors.map((d) => (d.id === key ? { ...d, ...clampInside(l, p) } : d)) };
}

/** New module size: every marker keeps its relative position. */
function resizeLayout(l: Layout, lengthM: number, heightM: number): Layout {
  const fx = lengthM / l.lengthM;
  const fy = heightM / l.heightM;
  const size = { lengthM, heightM };
  const opening = (o: Opening): Opening => ({
    wall: o.wall,
    pos: clamp(o.pos * (isSideWall(o.wall) ? fy : fx), OPENING_M / 2, wallLength(lengthM, heightM, o.wall) - OPENING_M / 2),
  });
  return {
    ...size,
    inlet: opening(l.inlet),
    outlet: opening(l.outlet),
    fire: clampInside(size, { x: l.fire.x * fx, y: l.fire.y * fy }),
    detectors: l.detectors.map((d) => ({ ...d, ...clampInside(size, { x: d.x * fx, y: d.y * fy }) })),
  };
}

function describeSpot(l: Layout, p: Point): string {
  const where = p.y >= l.heightM - 0.2 ? 'ceiling, ' : p.y <= 0.2 ? 'floor, ' : '';
  return `${where}${p.x.toFixed(1)} m along, ${p.y.toFixed(1)} m up`;
}

// ---------- drawing ----------

interface Palette {
  bg: string;
  surface: string;
  wall: string;
  text: string;
  muted: string;
  accent: string;
  info: string;
  danger: string;
  font: string;
  lut: Uint8ClampedArray;
}

function hexRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const SMOKE_RGB: [number, number, number] = [221, 227, 234];
/** Smoke shown on a log scale from clean air to LUT_TOP times the alarm level (and above). */
const LUT_TOP = 50;
const LUT_SPREAD = 4;
/** Position of a concentration on the colour scale, 0 to 1. */
function smokeShade(c: number, threshold: number): number {
  return Math.min(1, Math.log1p((LUT_SPREAD * c) / threshold) / Math.log1p(LUT_SPREAD * LUT_TOP));
}
/** Where the alarm level sits on the legend ramp, in percent. */
const THRESHOLD_ON_RAMP = `${(smokeShade(1, 1) * 100).toFixed(1)}%`;

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  const surface = v('--surface', '#10151c');
  const base = hexRgb(surface, [16, 21, 28]);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let n = 0; n < 256; n++) {
    const a = Math.pow(n / 255, 0.85);
    for (let ch = 0; ch < 3; ch++) lut[n * 3 + ch] = base[ch] + (SMOKE_RGB[ch] - base[ch]) * a;
  }
  return {
    bg: v('--bg', '#090c11'),
    surface,
    wall: v('--border-strong', '#2f3c4c'),
    text: v('--text', '#e8edf2'),
    muted: v('--text-muted', '#94a1af'),
    accent: v('--accent', '#ffb454'),
    info: v('--info', '#6cb6ff'),
    danger: v('--danger', '#ff6b5e'),
    font: v('--font-sans', 'system-ui, sans-serif'),
    lut,
  };
}

interface DrawInput {
  layout: Layout;
  frame: FrameMessage | null;
  mode: number;
  flow: FlowMessage | null;
  showFlow: boolean;
  inletSpeed: number;
  threshold: number;
  selected: string | null;
  focused: boolean;
  palette: Palette;
  scratch: HTMLCanvasElement;
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, pal: Palette) {
  const width = ctx.measureText(text).width;
  const lx = clamp(x - width / 2, 3, w - width - 3);
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.bg;
  ctx.strokeText(text, lx, y);
  ctx.fillStyle = pal.text;
  ctx.fillText(text, lx, y);
}

function drawPanel(canvas: HTMLCanvasElement, d: DrawInput) {
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (W === 0 || H === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(W * dpr);
  const ph = Math.round(H * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { layout: l, palette: pal } = d;
  const sx = W / l.lengthM;
  const sy = H / l.heightM;
  const X = (x: number) => x * sx;
  const Y = (y: number) => H - y * sy;

  // Smoke field: one pixel per cell on a scratch canvas, scaled up with smoothing.
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.surface;
  ctx.fillRect(0, 0, W, H);
  const field = d.frame?.fields[d.mode];
  if (d.frame && field) {
    const { nx, ny } = d.frame;
    if (d.scratch.width !== nx || d.scratch.height !== ny) {
      d.scratch.width = nx;
      d.scratch.height = ny;
    }
    const sctx = d.scratch.getContext('2d');
    if (sctx) {
      const img = sctx.createImageData(nx, ny);
      const thr = d.threshold > 0 ? d.threshold : 1;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const n = Math.round(smokeShade(field[j * nx + i], thr) * 255) * 3;
          const o = ((ny - 1 - j) * nx + i) * 4;
          img.data[o] = pal.lut[n];
          img.data[o + 1] = pal.lut[n + 1];
          img.data[o + 2] = pal.lut[n + 2];
          img.data[o + 3] = 255;
        }
      }
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(d.scratch, 0, 0, W, H);
    }
  }

  // Ventilation arrows on a coarse grid.
  const flow = d.flow;
  if (d.showFlow && flow && !flow.blocked && d.inletSpeed > 0) {
    const cols = Math.max(4, Math.round(W / 46));
    const rows = Math.max(2, Math.round(H / 46));
    ctx.strokeStyle = pal.info;
    ctx.fillStyle = pal.info;
    ctx.lineWidth = 1.25;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = ((c + 0.5) * W) / cols;
        const py = ((r + 0.5) * H) / rows;
        const i = clamp(Math.floor((px / W) * flow.nx), 0, flow.nx - 1);
        const j = clamp(Math.floor(((H - py) / H) * flow.ny), 0, flow.ny - 1);
        const ux = flow.ux[j * flow.nx + i];
        const uy = flow.uy[j * flow.nx + i];
        const speed = Math.hypot(ux, uy);
        if (!(speed > 1e-4 * d.inletSpeed)) continue;
        const rel = Math.min(1, Math.sqrt(speed / d.inletSpeed));
        const len = 5 + 11 * rel;
        const ex = ux / speed;
        const ey = -uy / speed;
        const x0 = px - (ex * len) / 2;
        const y0 = py - (ey * len) / 2;
        const x1 = px + (ex * len) / 2;
        const y1 = py + (ey * len) / 2;
        ctx.globalAlpha = 0.25 + 0.45 * rel;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - ex * 4 - ey * 3, y1 - ey * 4 + ex * 3);
        ctx.lineTo(x1 - ex * 4 + ey * 3, y1 - ey * 4 - ex * 3);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Walls, then the openings drawn over them.
  ctx.lineWidth = 2;
  ctx.strokeStyle = pal.wall;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.font = `600 11px ${pal.font}`;
  ctx.textBaseline = 'middle';
  for (const [key, o] of [
    ['inlet', l.inlet],
    ['outlet', l.outlet],
  ] as const) {
    const p = openingPoint(l, o);
    const along = isSideWall(o.wall) ? [0, OPENING_M / 2] : [OPENING_M / 2, 0];
    const inward = o.wall === 'left' ? [1, 0] : o.wall === 'right' ? [-1, 0] : o.wall === 'bottom' ? [0, -1] : [0, 1];
    const cx = clamp(X(p.x), 1, W - 1);
    const cy = clamp(Y(p.y), 1, H - 1);
    const hx = along[0] * sx;
    const hy = along[1] * sy;
    ctx.lineWidth = 5;
    ctx.strokeStyle = pal.surface;
    ctx.beginPath();
    ctx.moveTo(cx - hx, cy - hy);
    ctx.lineTo(cx + hx, cy + hy);
    ctx.stroke();
    const color = key === 'inlet' ? pal.info : pal.muted;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrow: into the module at the inlet, out of it at the outlet.
    const sign = key === 'inlet' ? 1 : -1;
    const ax0 = cx + inward[0] * (key === 'inlet' ? 2 : 16);
    const ay0 = cy + inward[1] * (key === 'inlet' ? 2 : 16);
    const ax1 = ax0 + inward[0] * 14 * sign;
    const ay1 = ay0 + inward[1] * 14 * sign;
    const ux = inward[0] * sign;
    const uy = inward[1] * sign;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax0, ay0);
    ctx.lineTo(ax1, ay1);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax1 + ux * 2, ay1 + uy * 2);
    ctx.lineTo(ax1 - ux * 5 - uy * 4, ay1 - uy * 5 + ux * 4);
    ctx.lineTo(ax1 - ux * 5 + uy * 4, ay1 - uy * 5 - ux * 4);
    ctx.closePath();
    ctx.fill();
    // Side walls: label above an opening in the upper half, below one in the lower half (clear of nearby detectors).
    const lx = clamp(cx + inward[0] * 30, 4, W - 4);
    const ly = clamp(cy + inward[1] * 30 + (isSideWall(o.wall) ? (cy < H / 2 ? -16 : 16) : 0), 8, H - 8);
    label(ctx, key === 'inlet' ? 'Inlet' : 'Outlet', lx, ly, W, pal);
  }

  // Fire.
  const fx = X(l.fire.x);
  const fy = Y(l.fire.y);
  const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 16);
  glow.addColorStop(0, pal.accent);
  glow.addColorStop(1, 'transparent');
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(fx, fy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.accent;
  ctx.strokeStyle = pal.bg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(fx, fy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  label(ctx, 'Fire', fx, fy - 15 < 8 ? fy + 16 : fy - 15, W, pal);

  // Detectors.
  const times = d.frame?.detect[d.mode] ?? [];
  l.detectors.forEach((det, n) => {
    const x = X(det.x);
    const y = Y(det.y);
    const t = times[n];
    const hit = typeof t === 'number';
    ctx.fillStyle = hit ? pal.danger : pal.bg;
    ctx.strokeStyle = hit ? pal.bg : pal.text;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.strokeRect(x - 5, y - 5, 10, 10);
    const text = hit ? `${det.id} ${Math.round(t)} s` : det.id;
    label(ctx, text, x, y > H / 2 ? y - 15 : y + 17, W, pal);
  });

  // Keyboard selection ring.
  if (d.focused && d.selected) {
    const m = markers(l).find((k) => k.key === d.selected);
    if (m) {
      ctx.strokeStyle = pal.text;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(clamp(X(m.p.x), 2, W - 2), clamp(Y(m.p.y), 2, H - 2), 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ---------- controls ----------

function Slider(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="lens-slider">
      <label htmlFor={props.id}>
        {props.label} <span className="num">{props.format(props.value)}</span>
      </label>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.hint && <span className="lens-hint">{props.hint}</span>}
    </div>
  );
}

// ---------- component ----------

export function SmokeSim({ onResult }: SmokeSimProps) {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [params, setParams] = useState<ModelParams>(DEFAULT_PARAMS);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);
  const [detect, setDetect] = useState<(number | null)[][]>([[], []]);
  const [blocked, setBlocked] = useState(false);
  const [showFlow, setShowFlow] = useState(true);
  const [selected, setSelected] = useState<string>('fire');
  const [focused, setFocused] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const frameRef = useRef<FrameMessage | null>(null);
  const flowRef = useRef<FlowMessage | null>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const paletteRef = useRef<Palette | null>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{ key: string; dx: number; dy: number } | null>(null);
  const viewRef = useRef({ layout, params, showFlow, selected, focused });
  const onResultRef = useRef(onResult);
  const reportedRef = useRef(false);

  const drawAll = useCallback(() => {
    rafRef.current = 0;
    if (!paletteRef.current) paletteRef.current = readPalette();
    if (!scratchRef.current) scratchRef.current = document.createElement('canvas');
    const v = viewRef.current;
    canvasRefs.current.forEach((canvas, mode) => {
      if (!canvas) return;
      drawPanel(canvas, {
        layout: v.layout,
        frame: frameRef.current,
        mode,
        flow: flowRef.current,
        showFlow: v.showFlow,
        inletSpeed: v.params.inletSpeed,
        threshold: v.params.threshold,
        selected: v.selected,
        focused: v.focused === mode,
        palette: paletteRef.current as Palette,
        scratch: scratchRef.current as HTMLCanvasElement,
      });
    });
  }, []);

  const requestDraw = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(drawAll);
  }, [drawAll]);

  // Latest view state for the drawing code, which runs outside React renders.
  useEffect(() => {
    viewRef.current = { layout, params, showFlow, selected, focused };
    onResultRef.current = onResult;
    requestDraw();
  }, [layout, params, showFlow, selected, focused, onResult, requestDraw]);

  // One worker for the lifetime of the component.
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./smoke.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      queueMicrotask(() => setError('This browser cannot run the simulator: Web Workers are not available.'));
      return;
    }
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'flow') {
        flowRef.current = m;
        setBlocked(m.blocked);
      } else {
        frameRef.current = m;
        if (timeRef.current) timeRef.current.textContent = `t = ${m.t.toFixed(1)} s of ${T_MAX_S} s`;
        setDetect((prev) => (JSON.stringify(prev) === JSON.stringify(m.detect) ? prev : m.detect));
        setDone(m.done);
        setPlaying(m.playing);
        setStarted(m.t > 0);
      }
      requestDraw();
    };
    worker.onerror = () => setError('The simulator stopped with an error. Reload the page to try again.');
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [requestDraw]);

  // Any change to the layout or the settings starts the run again from t = 0.
  useEffect(() => {
    workerRef.current?.postMessage({ type: 'setup', layout, params } satisfies WorkerIn);
  }, [layout, params]);

  // Redraw when the canvases change size; cancel a pending frame on unmount.
  useEffect(() => {
    const ro = new ResizeObserver(() => requestDraw());
    canvasRefs.current.forEach((c) => c && ro.observe(c));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [requestDraw]);

  // Report the detection times once per finished run (SmokeSimResult ids: "D1@0g", "D1@1g", ...).
  useEffect(() => {
    if (!done) {
      reportedRef.current = false;
      return;
    }
    if (reportedRef.current || !onResultRef.current) return;
    reportedRef.current = true;
    const results: SmokeSimResult[] = GRAVITY_MODES.flatMap((mode, mi) =>
      layout.detectors.map((d, di) => ({ detector_id: `${d.id}@${mode}`, t_detect_s: detect[mi]?.[di] ?? null })),
    );
    onResultRef.current(results);
  }, [done, detect, layout.detectors]);

  const post = (m: WorkerIn) => workerRef.current?.postMessage(m);
  const play = () => {
    if (done) post({ type: 'setup', layout, params });
    post({ type: 'play', speed });
    setPlaying(true);
  };
  const pause = () => {
    post({ type: 'pause' });
    setPlaying(false);
  };
  const restart = () => {
    post({ type: 'setup', layout, params });
    if (playing) post({ type: 'play', speed });
  };
  const skip = () => {
    post({ type: 'play', speed: Infinity });
    setPlaying(true);
  };
  const pickSpeed = (s: number) => {
    setSpeed(s);
    if (playing) post({ type: 'play', speed: s });
  };
  const setParam = (key: keyof ModelParams) => (value: number) => setParams((p) => ({ ...p, [key]: value }));

  const addDetector = () => {
    const l = layout;
    const id = DETECTOR_IDS.find((x) => !l.detectors.some((d) => d.id === x));
    if (!id || l.detectors.length >= MAX_DETECTORS) return;
    // New detectors start on the ceiling, mid-module, clear of the others.
    let x = l.lengthM / 2;
    const y = l.heightM - 0.1;
    while (l.detectors.some((d) => Math.abs(d.x - x) < 0.3 && Math.abs(d.y - y) < 0.3) && x < l.lengthM - 0.5) x += 0.5;
    const detectors = [...l.detectors, { id, ...clampInside(l, { x, y }) }].sort((a, b) => a.id.localeCompare(b.id));
    setLayout({ ...l, detectors });
    setSelected(id);
  };
  const removeDetector = (id: string) => setLayout((l) => ({ ...l, detectors: l.detectors.filter((d) => d.id !== id) }));
  const resetAll = () => {
    setLayout(DEFAULT_LAYOUT);
    setParams(DEFAULT_PARAMS);
    setSelected('fire');
  };

  // ---- pointer and keyboard on the canvases ----

  const pointAt = (el: HTMLCanvasElement, e: PointerEvent<HTMLCanvasElement>) => {
    const r = el.getBoundingClientRect();
    const l = viewRef.current.layout;
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    return { px, py, r, p: { x: (px / r.width) * l.lengthM, y: (1 - py / r.height) * l.heightM } };
  };
  const hitTest = (px: number, py: number, r: DOMRect): string | null => {
    const l = viewRef.current.layout;
    let best: string | null = null;
    let bestD = HIT_PX;
    for (const m of markers(l)) {
      const d = Math.hypot((m.p.x / l.lengthM) * r.width - px, (1 - m.p.y / l.heightM) * r.height - py);
      if (d < bestD) {
        best = m.key;
        bestD = d;
      }
    }
    return best;
  };
  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    const { px, py, r, p } = pointAt(el, e);
    const key = hitTest(px, py, r);
    if (!key) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    el.setPointerCapture(e.pointerId);
    const m = markers(viewRef.current.layout).find((k) => k.key === key);
    dragRef.current = { key, dx: (m?.p.x ?? p.x) - p.x, dy: (m?.p.y ?? p.y) - p.y };
    el.style.cursor = 'grabbing';
    setSelected(key);
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const el = e.currentTarget;
    const { px, py, r, p } = pointAt(el, e);
    const drag = dragRef.current;
    if (!drag) {
      el.style.cursor = hitTest(px, py, r) ? 'grab' : 'default';
      return;
    }
    setLayout((l) => moveMarker(l, drag.key, { x: p.x + drag.dx, y: p.y + drag.dy }));
  };
  const endDrag = (e: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    e.currentTarget.style.cursor = 'default';
  };
  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const l = layout;
    if (/^[1-4]$/.test(e.key)) {
      const d = l.detectors[Number(e.key) - 1];
      if (d) setSelected(d.id);
      return;
    }
    const pick: Record<string, string> = { f: 'fire', i: 'inlet', o: 'outlet' };
    if (pick[e.key.toLowerCase()]) {
      setSelected(pick[e.key.toLowerCase()]);
      return;
    }
    const dir: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const step = dir[e.key];
    const m = markers(l).find((k) => k.key === selected);
    if (!step || !m) return;
    e.preventDefault();
    const size = e.shiftKey ? 0.5 : 0.1;
    setLayout(moveMarker(l, selected, { x: m.p.x + step[0] * size, y: m.p.y + step[1] * size }));
  };

  // ---- results ----

  const firstAlarm = (mi: number): { id: string; t: number } | null => {
    let best: { id: string; t: number } | null = null;
    for (let di = 0; di < layout.detectors.length; di++) {
      const t = detect[mi]?.[di];
      if (typeof t === 'number' && (best === null || t < best.t)) best = { id: layout.detectors[di].id, t };
    }
    return best;
  };
  const cell = (t: number | null | undefined) => {
    if (typeof t === 'number') return <span className="smoke-hit">{seconds(t)}</span>;
    if (done) return <span className="muted">not within {T_MAX_S} s</span>;
    return <span className="muted">{started ? 'not yet' : '–'}</span>;
  };

  if (error) {
    return (
      <div className="callout" role="alert">
        {error}
      </div>
    );
  }

  const { lengthM: L, heightM: H } = layout;
  const primary = playing ? 'Pause' : done ? 'Run again' : started ? 'Resume' : 'Start';

  return (
    <div className="smoke-sim">
      <div className="callout" role="note">
        Illustrative model, not a validated one. A generic box module, not the layout of any real vehicle. Times are
        for comparing layouts with each other, not predictions of real detection times.
      </div>

      <section className="card smoke-toolbar" aria-label="Run controls">
        <div className="btn-row">
          <button type="button" className="btn btn-primary smoke-play" onClick={playing ? pause : play}>
            {primary}
          </button>
          <button type="button" className="btn" onClick={restart} disabled={!started}>
            Restart
          </button>
          <button type="button" className="btn" onClick={skip} disabled={done}>
            Skip to {T_MAX_S} s
          </button>
        </div>
        <div className="chips" role="group" aria-label="Simulation speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={s === speed} onClick={() => pickSpeed(s)}>
              {s}× speed
            </button>
          ))}
        </div>
        <span className="smoke-time" ref={timeRef}>
          {`t = 0.0 s of ${T_MAX_S} s`}
        </span>
      </section>

      <div className="smoke-panels">
        {GRAVITY_MODES.map((mode, i) => (
          <figure key={mode} className="smoke-panel">
            <figcaption className="smoke-panel-head">
              <strong>{MODE_INFO[mode].title}</strong>
              <span>{MODE_INFO[mode].note}</span>
            </figcaption>
            <canvas
              ref={(el) => {
                canvasRefs.current[i] = el;
              }}
              className="smoke-canvas"
              style={{ aspectRatio: `${L} / ${H}` }}
              tabIndex={0}
              role="application"
              aria-roledescription="simulation view"
              aria-label={`${MODE_INFO[mode].title} view of a ${L} by ${H} metre module. Drag the fire, inlet, outlet and detectors. Keyboard: F, I, O or 1 to 4 picks a marker, arrow keys move it.`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(i)}
              onBlur={() => setFocused((f) => (f === i ? null : f))}
            />
          </figure>
        ))}
      </div>

      <div className="smoke-legend">
        <span className="smoke-ramp-wrap">
          <span className="smoke-ramp" aria-hidden="true" style={{ ['--thr' as string]: THRESHOLD_ON_RAMP }} />
          <span>
            clean air → {LUT_TOP} × alarm level, log scale; the tick is the alarm level
          </span>
        </span>
        <span>
          <i className="smoke-key smoke-key-fire" aria-hidden="true" /> fire
        </span>
        <span>
          <i className="smoke-key smoke-key-det" aria-hidden="true" /> detector,{' '}
          <i className="smoke-key smoke-key-hit" aria-hidden="true" /> alarm
        </span>
        <span>
          <i className="smoke-key smoke-key-flow" aria-hidden="true" /> air flow
        </span>
      </div>
      <p className="muted small smoke-hint">
        Drag the fire, the inlet, the outlet and the detectors in either view; both runs use the same layout. Keyboard:
        focus a view, press F, I, O or 1 to 4 to pick a marker, then the arrow keys (Shift for larger steps).
      </p>

      {blocked && (
        <div className="callout" role="status">
          The inlet covers the outlet, so no air flows. Move one of them.
        </div>
      )}

      <section className="card card-stack" aria-labelledby="smoke-results-h">
        <div className="smoke-results-head">
          <h2 id="smoke-results-h">Time to detection</h2>
          <button type="button" className="btn" onClick={addDetector} disabled={layout.detectors.length >= MAX_DETECTORS}>
            Add detector
          </button>
        </div>
        {layout.detectors.length === 0 ? (
          <p className="muted">No detectors. Add one, then drag it where you want it.</p>
        ) : (
          <div className="table-scroll">
            <table className="gapmap-table smoke-table">
              <thead>
                <tr>
                  <th scope="col">Detector</th>
                  <th scope="col">Position</th>
                  <th scope="col">0 g</th>
                  <th scope="col">1 g</th>
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {layout.detectors.map((d, di) => (
                  <tr key={d.id}>
                    <th scope="row">{d.id}</th>
                    <td>{describeSpot(layout, d)}</td>
                    <td>{cell(detect[0]?.[di])}</td>
                    <td>{cell(detect[1]?.[di])}</td>
                    <td>
                      <button type="button" className="chip" onClick={() => removeDetector(d.id)} aria-label={`Remove ${d.id}`}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {started && layout.detectors.length > 0 && (
          <ul className="lens-notes" aria-live="polite">
            {GRAVITY_MODES.map((mode, mi) => {
              const a = firstAlarm(mi);
              return (
                <li key={mode}>
                  {MODE_INFO[mode].title}:{' '}
                  {a ? `first alarm ${a.id} after ${seconds(a.t)}.` : done ? `no alarm within ${T_MAX_S} s.` : 'no alarm yet.'}
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted small">
          A detector alarms when the smoke in its grid cell reaches the threshold. Concentration is in relative units:
          100 is the level the whole module would reach if {MIX_TIME_S} s of smoke were mixed evenly with the ventilation
          off.
        </p>
      </section>

      <section className="card card-stack" aria-labelledby="smoke-settings-h">
        <div className="smoke-results-head">
          <h2 id="smoke-settings-h">Model settings</h2>
          <button type="button" className="btn" onClick={resetAll}>
            Reset layout and settings
          </button>
        </div>
        <p className="muted small">Chosen for illustration, not measured values. Any change starts the run again.</p>
        <div className="lens-controls">
          <Slider
            id="smoke-inlet"
            label="Inlet air speed"
            value={params.inletSpeed}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${v.toFixed(2)} m/s`}
            hint="0 turns the ventilation off."
            onChange={setParam('inletSpeed')}
          />
          <Slider
            id="smoke-threshold"
            label="Alarm threshold"
            value={params.threshold}
            min={1}
            max={50}
            step={1}
            format={(v) => `${v} units`}
            hint={`100 units = ${MIX_TIME_S} s of smoke mixed through the module.`}
            onChange={setParam('threshold')}
          />
          <Slider
            id="smoke-length"
            label="Module length"
            value={L}
            min={3}
            max={12}
            step={0.5}
            format={(v) => `${v.toFixed(1)} m`}
            onChange={(v) => setLayout((l) => resizeLayout(l, v, l.heightM))}
          />
          <Slider
            id="smoke-height"
            label="Module height"
            value={H}
            min={2}
            max={4}
            step={0.25}
            format={(v) => `${v.toFixed(2)} m`}
            onChange={(v) => setLayout((l) => resizeLayout(l, l.lengthM, v))}
          />
        </div>
        <details className="smoke-details">
          <summary>More settings: mixing and the 1 g plume</summary>
          <div className="lens-controls">
            <Slider
              id="smoke-mixing"
              label="Mixing"
              value={params.mixing}
              min={0.002}
              max={0.05}
              step={0.001}
              format={(v) => `${v.toFixed(3)} m²/s`}
              hint="One coefficient for turbulence and fans, used in both runs."
              onChange={setParam('mixing')}
            />
            <Slider
              id="smoke-rise"
              label="Rise speed at the fire (1 g)"
              value={params.riseSpeed}
              min={0.1}
              max={1}
              step={0.05}
              format={(v) => `${v.toFixed(2)} m/s`}
              hint="Upward drift of the hottest smoke. Zero in the 0 g run."
              onChange={setParam('riseSpeed')}
            />
            <Slider
              id="smoke-cooling"
              label="Cooling time (1 g)"
              value={params.coolingS}
              min={2}
              max={60}
              step={1}
              format={(v) => `${v} s`}
              hint="How fast smoke loses its rise as it cools."
              onChange={setParam('coolingS')}
            />
          </div>
        </details>
        <label className="lens-check">
          <input type="checkbox" checked={showFlow} onChange={(e) => setShowFlow(e.target.checked)} />
          Show air flow arrows
        </label>
      </section>

      <details className="card smoke-details">
        <summary>How this model works, and what it leaves out</summary>
        <ul className="lens-notes">
          <li>
            A side view of a generic box module, {L} m long and {H} m high, on a grid of 80 cells along its length.
          </li>
          <li>
            Air flow: potential flow from the inlet to the outlet, both {OPENING_M} m wide. It has no jets, eddies or
            recirculation; turbulence and fans are lumped into the one mixing coefficient.
          </li>
          <li>
            Smoke: a concentration released at a constant rate at the fire, carried by the air and spread by mixing. It
            leaves only through the outlet. The fire does not grow and walls do not take up smoke.
          </li>
          <li>
            1 g: a heat value travels with the smoke, is held at 1 at the fire and fades with the cooling time; smoke
            rises at the rise speed times that value. Real fires also drive a fast layer of hot gas along the ceiling,
            which this model leaves out.
          </li>
          <li>0 g: no rise. Air flow and mixing are the same as in the 1 g run.</li>
          <li>
            Smoke is treated as a concentration, not as particles. Real detectors respond to particles, and particle
            size and detector response are what the NASA smoke experiments measured.
          </li>
          <li>
            Only 0 g and 1 g are modelled. The model says nothing about lunar or Martian gravity, and the two runs are
            not bounds for them.
          </li>
          <li>
            Numerics: finite volumes, explicit time steps, second-order upwind advection with a minmod limiter, run in a
            Web Worker. Smoke is conserved apart from what leaves through the outlet.
          </li>
        </ul>
      </details>
    </div>
  );
}
