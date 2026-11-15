# Smoke detection simulator (SPEC module 6)

An **illustrative model, not a validated one**. It shows why smoke detector placement depends on gravity and on the
ventilation flow: the same module, fire, vents and detectors run side by side in microgravity (0 g) and in 1 g.
It is not a model of any real vehicle, and its times are for comparing layouts, not predictions of real detection
times. It contains no NASA data; the real smoke research (SAME, SAME-R, DAFT) is shown from the curated data on the
`/simulator` page next to it.

| File | Role |
|---|---|
| `model.ts` | Grid, ventilation flow, smoke transport, detectors. Pure TypeScript, no DOM. |
| `smoke.worker.ts` | Web Worker: runs the 0 g and 1 g models together, posts fields about 30 times a second. |
| `SmokeSim.tsx` | The `<SmokeSim />` component (contract: `docs/CONTRACTS.md` section 8): canvas drawing and controls. |
| `model.test.ts` | vitest: divergence-free flow, conservation, 1 g vs 0 g ordering, no false alarms. |

## Model

- **Geometry.** A vertical slice (side view) of a box module, length 3 to 12 m, height 2 to 4 m (default 6 m x 3 m).
  80 cells along the length; the height gets as many cells as keep them square (10 to 80).
- **Ventilation.** Potential flow: Laplace's equation for the velocity potential on the cell grid (finite volumes,
  SOR), with the inlet and outlet speeds as the only non-zero wall fluxes. Both openings are 0.4 m wide; the outlet
  speed is set so that what enters leaves. The field is divergence-free, but it has no jets, eddies or recirculation.
- **Smoke.** One concentration field, advection-diffusion, explicit finite volumes with second-order upwind
  (minmod-limited) advection. Released at a constant rate in the fire cell; clean air enters at the inlet; smoke leaves
  only through the outlet. Concentrations stay non-negative and smoke is conserved apart from the outlet (tested).
- **Units.** Relative: 100 = the level the whole module would reach if 60 s of smoke were mixed evenly with the
  ventilation off. The emission rate scales with the module size so this holds for any size.
- **1 g.** A second scalar, the excess heat of the smoke (0 to 1), moves with the smoke, is held at 1 in the fire
  cell and decays with the cooling time. Smoke and heat get an upward drift of `riseSpeed * heat` on every horizontal
  face (from the cell below). This makes a rising plume that slows as it cools and collects under the ceiling.
- **0 g.** No drift. Same flow, mixing and source as the 1 g run.
- **Detectors.** Up to 4. A detector alarms when the concentration in its cell reaches the threshold; the time is
  interpolated within the time step. `onResult` reports ids `D1@0g`, `D1@1g`, ... once per finished run.
- **Time step.** `dt = min(0.25 s, 0.8 / (2 (u/dx + v/dy) + 2 D (1/dx^2 + 1/dy^2)))`, so the summed Courant number
  stays at or below 0.4. A 300 s run of both models takes well under a second of CPU on a laptop.

## Settings (all user-adjustable, chosen for illustration, not measured values)

| Setting | Default | Range |
|---|---|---|
| Inlet air speed | 0.2 m/s | 0 to 1 m/s (0 = ventilation off) |
| Alarm threshold | 5 units | 1 to 50 |
| Mixing (eddy diffusivity) | 0.01 m^2/s | 0.002 to 0.05 |
| Rise speed at the fire (1 g) | 0.5 m/s | 0.1 to 1 |
| Cooling time (1 g) | 20 s | 2 to 60 s |

## What it leaves out

- Ceiling jets: real fires drive a fast layer of hot gas along the ceiling; here smoke under the ceiling spreads only
  by mixing and the ventilation flow.
- Particles: smoke is a concentration, not particles. Real detectors respond to particles, and particle size is
  contested in the PSI data (SAME vs SAME-R): show both findings, never pick one.
- Fire growth, wall deposition, the third dimension, obstacles, real fan jets.
- **Partial gravity.** Only 0 g and 1 g. The model says nothing about lunar or Martian gravity, and the two runs are
  not bounds for them (see `docs/STATUS.md` section 5, point 10).
