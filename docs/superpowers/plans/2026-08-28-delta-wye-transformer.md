# Delta–Wye Transformer Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second self-contained page to em-visuals: a pedagogical 3-phase delta–wye (Dy11) transformer on a 3-limb core, showing core flux, leakage B, induced E, and the vector-group phase shift.

**Architecture:** Hybrid physics model — core flux from an ideal linear magnetic circuit (phasor solve, all sinusoidal); leakage B in air from the existing verified Biot–Savart kernel fed only the balanced (load) MMF pair; induced E from −∂A/∂t where A of the confined core flux is obtained via flux-tube duality (the Biot–Savart *B* kernel evaluates *A* of a flux loop). Everything stays in the repo's cos/sin two-basis form, so per-frame animation is a blend of precomputed bases; the load slider is a pure re-scale, no recompute.

**Tech Stack:** Vanilla ES modules + vendored Three.js 0.185.1 (+ VRButton), `node --test` for unit tests, plain node scripts for physics verification, GitHub Pages via existing workflow.

**Spec:** The approved design lives in the conversation (brainstorming phase, 2026-08-28). Its content is summarized in **Context** below; this plan is self-sufficient.

## Context

The repo currently holds one page, `rotating-field-machine.html` (~1,470 lines): an air-cored 3-phase stator with exact finite-segment Biot–Savart kernels (`fieldB`, `fieldA`, lines 361–395), verified by `verify_fields.js` (which today *duplicates* the kernels), plus `tests/*.mjs` invariant tests and a Pages workflow that deploys the single page as `index.html` with `__BUILD_HASH__`/`__BUILD_TIME__` sed substitution.

A transformer is an iron device; plain air-core Biot–Savart cannot show one. The approved design:

- **Core flux** φ_k(t) per limb comes from Faraday applied to the stiff delta primary (linear, balanced, steady-state) — drawn as animated flux bundles inside a drawn 3-limb core, brightness ∝ |φ(t)|. The Σφ = 0 fact (why a 3-limb core needs no return leg) becomes directly visible.
- **Air B (leakage)** is sourced from the balanced MMF pair only (primary load component + opposing secondary), which is exactly the part of the field that really lives in air. At no-load the air field is identically zero — itself pedagogically honest.
- **Induced E** = −∂A/∂t with A = A_core + A_leak. A_core uses flux-tube duality: the Coulomb-gauge A of a thin closed flux tube has the same Biot–Savart form as B of a current filament, so the *existing* `fieldB` kernel computes it when fed the core skeleton weighted by mesh fluxes. E visibly circles the limbs — the reason the secondary sees a voltage.
- **Vector group Dy11** (secondary line quantities lead primary by +30°, line-line ratio √3·Ns/Np) *emerges* from the connection topology and is asserted by tests, not hardcoded into the display.

Not included (documented in the page's "what this model does not include" section, mirroring the existing page): saturation, hysteresis, inrush, winding resistance and leakage-impedance voltage drop, unbalanced load, third-harmonic/delta circulating current, iron boundary condition on the leakage field (no Rogowski correction), XR grab (view-only XR).

## Global Constraints

- No external network resources in pages: `tests/pages-test.mjs` asserts no `src/href="http(s):"`, no fonts.googleapis/cdnjs — the new page must satisfy the same rule (vendored three.js only).
- Pages must use the WebXR-owned loop: `renderer.setAnimationLoop(frame)`, **never** `requestAnimationFrame` (asserted by page tests).
- Build stamp: every deployed page carries `build <code>__BUILD_HASH__</code> · published <time datetime="__BUILD_TIME__">__BUILD_TIME__</time>`, substituted by sed in `.github/workflows/pages.yml`.
- Normalized units, matching the existing page: ω = 1, μ0·I·N/(4π) = 1. In these units Ampère's law reads ∮B·dl = 4π × (enclosed weight); the flux-loop duality weight for flux Φ is **Φ/(4π)** (numerically verified: the kernel's circulation around a linking loop is exactly 4π × weight).
- Phasor ↔ time convention everywhere: x(t) = Re[X·e^{jωt}] ⇒ (wc, ws) = (Re X, −Im X), matching the page's `cos·wc + sin·ws` blend.
- Visual language: reuse the existing page's CSS custom properties, rail/scope/hint layout, and palette (`--pa/--pb/--pc` phase colors) verbatim.
- `npm test` (node --test tests/*.mjs + verify scripts) must be green at the end of every task; commit per task.
- Node 22 (per CI).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `field-kernels.js` | create | Shared exact finite-segment `fieldB`/`fieldA` kernels (extracted from the page; single source of truth) |
| `transformer-model.js` | create | Pure model: constants, phasor circuit solve, winding/flux-loop segment builders, bundle spans — fully node-testable |
| `delta-wye-transformer.html` | create | The page: scene, meshes, probes, animation, scopes, controls, XR view |
| `verify_transformer.js` | create | Field-integral verification (duality, Faraday loop, Ampère, no-load null) |
| `tests/transformer-model-test.mjs` | create | Circuit/geometry unit tests |
| `tests/transformer-page-test.mjs` | create | Page invariants (self-contained, XR loop, build stamp, workflow wiring) |
| `rotating-field-machine.html` | modify | Replace inline kernels with `import { fieldB, fieldA } from './field-kernels.js'`; add cross-link |
| `verify_fields.js` | modify | Drop duplicated kernels, import shared module |
| `tests/pages-test.mjs` | modify | Assert the motor page imports `./field-kernels.js` |
| `.github/workflows/pages.yml` | modify | Deploy both pages, sed both, copy new JS modules |
| `package.json` | modify | Append `verify_transformer.js` to test chain |
| `README.md` | modify | Document the second page |

Deployment layout (PENDING USER CHOICE): recommended — motor page stays `_site/index.html` (URL-stable), transformer at `_site/delta-wye-transformer.html`, small cross-links in each rail header.

---

## Task 1: Extract shared field kernels

**Files:**
- Create: `field-kernels.js`
- Modify: `rotating-field-machine.html` (lines ~357–395), `verify_fields.js` (lines 52–91), `tests/pages-test.mjs`, `.github/workflows/pages.yml` (assemble step)

**Interfaces:**
- Produces: `export function fieldB(px, py, pz, SEG)` and `export function fieldA(px, py, pz, SEG)` — each returns a **fresh** `Float64Array(6)` `[Xc_x, Xc_y, Xc_z, Xs_x, Xs_y, Xs_z]` (cos-basis then sin-basis), `SEG` a stride-8 flat array `x1 y1 z1 x2 y2 z2 wc ws`. Fresh allocation per call (kernels are precompute-only; no per-frame calls anywhere).

- [ ] **Step 1: Write the failing test** — add to `tests/pages-test.mjs`, inside the `page is self-contained` test:

```js
assert.match(html, /\.\/field-kernels\.js/);
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (no such import yet).
- [ ] **Step 3: Create `field-kernels.js`** — move the page's kernel bodies (rotating-field-machine.html:360–395) verbatim except: drop the shared `_o6` buffer, allocate `new Float64Array(6)` per call; keep the `1e-12` guards. Header comment: units note + "verified by verify_fields.js".
- [ ] **Step 4: Refactor the page** — delete inline `fieldB`/`fieldA` + `_o6`, add `import { fieldB, fieldA } from './field-kernels.js';` next to the `xr-controls.js` import. No call-site changes (callers already treat the return as read-immediately).
- [ ] **Step 5: Refactor `verify_fields.js`** — delete its local `fieldB`/`fieldA` (lines 52–91), add the import. Call sites already consume immediately; the two-calls-in-one-expression at line 153–154 is safe with fresh allocations.
- [ ] **Step 6: Update workflow** — in `pages.yml` assemble step add `cp field-kernels.js _site/field-kernels.js` beside the `xr-controls.js` copy.
- [ ] **Step 7: Run `npm test`** — all green, including the untouched Maxwell checks (they now guard the *shipped* kernels instead of a copy).
- [ ] **Step 8: Commit** — `git add -A && git commit -m "refactor: extract shared Biot–Savart kernels into field-kernels.js"`

---

## Task 2: transformer-model.js — phasor circuit solve

**Files:**
- Create: `transformer-model.js`, `tests/transformer-model-test.mjs`

**Interfaces:**
- Produces:
  - `export const ELEC = { V: 1, Np: 1, Ns: 0.5, omega: 1, reluct: 0.03, IsFull: 1 }`
  - `export const C = { add, sub, mul, scale, abs, arg }` — phasors as `[re, im]`
  - `export function toWcWs(X)` → `[X[0], -X[1]]`
  - `export function solve(load)` → `{ VL, Up, PHI, Vs, Is, Imag, Ip, IlineP, ratios: { lineLine, angleDeg }, power: { pIn, pOut } }` — all phasor triples indexed by limb k = 0,1,2 (delta windings across A-B, B-C, C-A; wye secondary same polarity)

Model equations (implement exactly):

```js
// x(t) = Re[X e^{jwt}]  =>  (wc, ws) = (Re X, -Im X)
const ang = k => -k * 2 * Math.PI / 3;
const VL  = [0,1,2].map(k => [V * Math.cos(ang(k)), V * Math.sin(ang(k))]); // V_A, V_B, V_C (line-neutral)
const Up  = [0,1,2].map(k => C.sub(VL[k], VL[(k+1)%3]));   // delta winding voltages V_AB, V_BC, V_CA
const PHI = Up.map(u => C.mul(u, [0, -1/(omega*Np)]));     // Faraday: PHI = Up/(j*omega*Np)
const Vs  = Up.map(u => C.scale(u, Ns/Np));                // secondary line-neutral EMF
const Is  = Vs.map(v => C.scale(v, load * IsFull / C.abs(Vs[0]))); // resistive load, in phase with Vs
const Imag = PHI.map(p => C.scale(p, reluct/Np));          // magnetizing branch (linear reluctance)
const Ip  = [0,1,2].map(k => C.add(Imag[k], C.scale(Is[k], Ns/Np))); // MMF balance
const IlineP = [0,1,2].map(k => C.sub(Ip[k], Ip[(k+2)%3])); // I_A = I(AB winding) - I(CA winding)
```

`reluct: 0.03` makes |Imag| ≈ 10 % of full-load reflected current (|Imag| = √3·V·reluct/(ω·Np²) ≈ 0.052 vs 0.5).

- [ ] **Step 1: Write failing tests** in `tests/transformer-model-test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, C, ELEC, toWcWs } from '../transformer-model.js';

const deg = r => r * 180 / Math.PI;

test('limb fluxes are balanced and sum to zero', () => {
  const s = solve(1);
  const sum = s.PHI.reduce((a, p) => C.add(a, p), [0, 0]);
  assert.ok(C.abs(sum) < 1e-12);
  assert.ok(Math.abs(C.abs(s.PHI[0]) - C.abs(s.PHI[1])) < 1e-12);
});

test('Dy11: secondary line-line leads primary line-line by +30°, ratio = sqrt(3)*Ns/Np', () => {
  const s = solve(0.7);
  const VabP = s.Up[0];                       // primary line-line A-B
  const VabS = C.sub(s.Vs[0], s.Vs[1]);       // secondary line-line a-b
  let shift = deg(C.arg(VabS) - C.arg(VabP));
  if (shift > 180) shift -= 360; if (shift < -180) shift += 360;
  assert.ok(Math.abs(shift - 30) < 1e-9);
  assert.ok(Math.abs(C.abs(VabS)/C.abs(VabP) - Math.sqrt(3)*ELEC.Ns/ELEC.Np) < 1e-12);
});

test('real power balances (lossless), magnetizing is purely reactive', () => {
  const s = solve(1);
  const re = (a, b) => a[0]*b[0] + a[1]*b[1];          // Re(X * conj(Y))
  const pOut = 3 * re(s.Vs[0], s.Is[0]);
  const pIn = [0,1,2].reduce((a, k) => a + re(s.VL[k], s.IlineP[k]), 0);
  assert.ok(Math.abs(pIn - pOut) / pOut < 1e-9);
  assert.ok(Math.abs(re(s.Up[0], s.Imag[0])) < 1e-12);
});

test('no-load: balanced pair vanishes, magnetizing current remains', () => {
  const s = solve(0);
  assert.equal(C.abs(s.Is[0]), 0);
  assert.ok(C.abs(s.Imag[0]) > 0.01);
  assert.ok(C.abs(s.Ip[0]) - C.abs(s.Imag[0]) < 1e-12);
});

test('toWcWs matches the cos/sin blend convention', () => {
  // x(t) = Re[X e^{jwt}] at wt=0.7 must equal wc*cos + ws*sin
  const X = [0.3, -0.8], t = 0.7, [wc, ws] = toWcWs(X);
  const direct = X[0]*Math.cos(t) - X[1]*Math.sin(t);
  assert.ok(Math.abs(wc*Math.cos(t) + ws*Math.sin(t) - direct) < 1e-15);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/transformer-model-test.mjs` → FAIL (module missing).
- [ ] **Step 3: Implement** `transformer-model.js` per the equations above (`C` helpers ~10 lines; `solve` ~25 lines).
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: transformer phasor circuit model (Dy11, magnetizing branch, MMF balance)"`

---

## Task 3: transformer-model.js — geometry builders

**Files:**
- Modify: `transformer-model.js`
- Test: `tests/transformer-model-test.mjs` (extend)

**Interfaces:**
- Produces:
  - `export const GEOM = { limbX: [-2.2, 0, 2.2], limbTop: 1.6, rCore: 0.30, rLV: 0.42, rHV: 0.58, nLoops: 12, segsPerLoop: 24, windHalf: 1.1 }`
  - `export function windingSegs(sol)` → `Float32Array` stride-8: for each limb k, `nLoops` polygonal loops at `rHV` with per-loop weight `toWcWs(scale(Is[k], Ns))/nLoops` and `nLoops` at `rLV` with weight `toWcWs(scale(Is[k], -Ns))/nLoops` — the balanced pair (primary carries Np·(Ns/Np)·Is = Ns·Is ampere-turns). Loop winding sense: counterclockwise viewed from +z (positive current ⇒ +z flux).
  - `export function fluxLoopSegs(sol)` → `Float64Array` stride-8: two 4-segment rectangles along the core centerline in the y = 0 plane — mesh L through limbs 0–1, weight `toWcWs(PHI[0])/(4π)`; mesh R through limbs 1–2, weight `toWcWs(scale(PHI[2], -1))/(4π)` (1/(4π) normalization verified — makes ∮A·dl = Φ). Traversal sense: up the left limb of each rectangle (+z at the smaller x), so mesh flux positive = +z flux in that limb; both rectangles MUST share the same orientation convention (verified caveat: inconsistent traversal corrupts limb 1's shared-path superposition).
  - `export function fluxBundleSpans()` → array of `{ kind: 'limb'|'yoke', k?, from: [x, z], to: [x, z], phasorOf: (sol) => [re, im] }`: three limb spans carrying `PHI[k]`; top-yoke spans 0→1 carrying `PHI[0]` and 1→2 carrying `scale(PHI[2], -1)`; bottom-yoke spans mirrored with opposite sign (return path).

Mesh-flux decomposition to verify in tests: limb up-fluxes (φ1, φ2, φ3) = (φL, φR − φL, −φR) with φL = Φ[0], φR = −Φ[2]; limb 1 check uses ΣΦ = 0.

- [ ] **Step 1: Write failing tests** (extend `tests/transformer-model-test.mjs`):

```js
import { GEOM, windingSegs, fluxLoopSegs, fluxBundleSpans, solve, C, ELEC } from '../transformer-model.js';

test('winding segments: counts, closure, and per-limb ampere-turn sums', () => {
  const s = solve(1);
  const SEG = windingSegs(s);
  assert.equal(SEG.length / 8, 3 * 2 * GEOM.nLoops * GEOM.segsPerLoop);
  // primary (+Ns·Is) and secondary (−Ns·Is) cancel per limb: net weight sums to zero
  let netC = 0, netS = 0;
  for (let i = 0; i < SEG.length; i += 8) { netC += SEG[i + 6]; netS += SEG[i + 7]; }
  assert.ok(Math.abs(netC) < 1e-9 && Math.abs(netS) < 1e-9);
  // every loop polygon closes: each segment's end is the next segment's start (mod segsPerLoop)
  for (let loop = 0; loop < SEG.length / (8 * GEOM.segsPerLoop); loop++) {
    const base = loop * GEOM.segsPerLoop * 8;
    for (let i = 0; i < GEOM.segsPerLoop; i++) {
      const a = base + i * 8, b = base + ((i + 1) % GEOM.segsPerLoop) * 8;
      for (let d = 0; d < 3; d++) assert.ok(Math.abs(SEG[a + 3 + d] - SEG[b + d]) < 1e-6);
    }
  }
});

test('mesh-flux decomposition reproduces the limb fluxes', () => {
  const s = solve(0.5);
  const phiL = s.PHI[0], phiR = C.scale(s.PHI[2], -1);
  const limb1 = C.sub(phiR, phiL);
  assert.ok(C.abs(C.sub(limb1, s.PHI[1])) < 1e-12);
});

test('flux mesh paths are closed', () => {
  const SEG = fluxLoopSegs(solve(1));
  // 2 rectangles x 4 segments; each segment's end must equal the next segment's start,
  // and segment 3's end must equal segment 0's start within each rectangle
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 4; i++) {
      const a = (r * 4 + i) * 8, b = (r * 4 + (i + 1) % 4) * 8;
      for (let d = 0; d < 3; d++) assert.ok(Math.abs(SEG[a + 3 + d] - SEG[b + d]) < 1e-12);
    }
  }
});

test('flux bundle spans conserve flux at the yoke junctions', () => {
  const s = solve(0);
  const spans = fluxBundleSpans();
  const top01 = spans.find(x => x.kind === 'yoke' && x.from[0] === GEOM.limbX[0] && x.to[0] === GEOM.limbX[1] && x.from[1] > 0);
  assert.ok(C.abs(C.sub(top01.phasorOf(s), s.PHI[0])) < 1e-12);
  const top12 = spans.find(x => x.kind === 'yoke' && x.from[0] === GEOM.limbX[1] && x.to[0] === GEOM.limbX[2] && x.from[1] > 0);
  assert.ok(C.abs(C.sub(top12.phasorOf(s), C.scale(s.PHI[2], -1))) < 1e-12);
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** the three builders (~90 lines total; loops as `segsPerLoop`-gon polygons at z evenly spaced in `[-windHalf, windHalf]`, centered on `(limbX[k], 0)`).
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: transformer winding and core flux-loop geometry"`

---

## Task 4: verify_transformer.js — field-integral verification

**Files:**
- Create: `verify_transformer.js`
- Modify: `package.json` (test script → `node --test tests/*.mjs && node verify_fields.js && node verify_transformer.js`)

**Interfaces:**
- Consumes: `fieldB`, `fieldA` from `field-kernels.js`; `solve`, `windingSegs`, `fluxLoopSegs`, `GEOM`, `ELEC`, `toWcWs` from `transformer-model.js`.
- Style: plain node script like `verify_fields.js` — `check(name, got, want, tol)` helper, pass/fail counters, `process.exit(fail ? 1 : 0)`.

Checks to implement (numerical line integrals via dense polygonal sampling, ~2000 points/loop):

1. **Duality normalization** (constant verified in design review): unit-flux rectangular loop fed to `fieldB` with weight 1/(4π) ⇒ ∮A·dl around a circle linking one leg ≈ 1.0 (= Φ), tol 1 %. Also ∮A·dl around a circle *not* linking the loop ≈ 0.
2. **curl A_core = 0 and div A_core = 0** off the skeleton (reuse the `divergence`/`curl` finite-difference helpers pattern from `verify_fields.js:116–135`). Keep probe points ≥ 0.4 from the skeleton — A diverges ~2w/ρ at the filament.
3. **Faraday closes the loop (E sign guard)**: at t ∈ {0, 0.9, 2.1}, ∮E·dl around a circle of radius `rLV` encircling limb k (+z normal, counterclockwise from +z) equals −dφ_k/dt(t) = −Re[jω·Φ_k·e^{jωt}], tol 2 %. E is the SUM of both displayed parts (core duality A + winding `fieldA` part — the display includes both; the winding part contributes ~0 to this particular loop since it encloses zero net ampere-turns, but assert the combined value so the display path is what's tested). The sign is the classic bug — do not loosen this to a magnitude check.
4. **No-load null**: `solve(0)` ⇒ `windingSegs` weights all zero ⇒ max |B| over 50 window sample points < 1e-12.
5. **MMF-balance null on the limb axis** (full load): |B| at points ON the limb axis inside the LV bore (|z| < 0.6·windHalf) is < 5 % of |B| in the LV–HV gap at the same z — inside both windings the opposing solenoid fields cancel because net ampere-turns are zero. (NOT an Ampère circle in the xy-plane: a horizontal circle around the limb encloses none of the azimuthal winding currents and tests nothing — trap found in design review.)
6. **Leakage far field is the sum of three limb dipoles**: at R ∈ {8, 16} in a few directions, total `fieldB(·, SEGW)` at t = 0 matches superposed point dipoles at the limb centers with m_z,k = (Ns·is_k(0))·π·(rHV² − rLV²), tol 5 %/2 % (the balanced pair has a NET dipole moment ∝ loop-area difference — verified; it is not a quadrupole).
7. **Field-level Dy11**: the phase of ∮E·dl around limb 0 (as a phasor extracted from two time samples at t = 0 and t = π/2) matches the circuit solve's `arg(jω·Φ[0])` within 1° — ties the field picture to the circuit.
8. **Kernel allocation contract**: call `fieldB` then `fieldA`, then re-check the first result is unchanged — guards the fresh-`Float64Array` contract from Task 1 against a future "optimization" back to a shared buffer.

- [ ] **Step 1: Write the script with all eight checks** (~220 lines, mirroring `verify_fields.js` structure and console format).
- [ ] **Step 2: Run `node verify_transformer.js`** — all pass. If check 1 fails on the constant, STOP and fix the normalization in `fluxLoopSegs` (single source: the 1/(4π) factor), not the test.
- [ ] **Step 3: Wire into `package.json`; run full `npm test`** — green.
- [ ] **Step 4: Commit** — `git commit -m "test: field-integral verification for the transformer model"`

---

## Task 5: Page skeleton — chrome, scene, static meshes

**Files:**
- Create: `delta-wye-transformer.html`, `tests/transformer-page-test.mjs`

**Interfaces:**
- Consumes: `field-kernels.js`, `transformer-model.js`, `./vendor/three.module.js`, `./vendor/VRButton.js`, `./xr-controls.js` (`applyDeadzone`, `nextScale` only — no grab).
- Produces: page skeleton with working orbit + static transformer rendering; `S` state object; rail controls present but only view toggles wired.

Structure (clone the existing page's patterns; line references are into `rotating-field-machine.html`):
- Head/CSS: copy `:root` tokens, rail/section/toggle/slider/scope/hint/veil-free chrome (lines 7–150), title `Delta–wye transformer — 3-limb core, Φ, B and E`, `<h1>Delta–wye —<br><em>3-limb transformer</em></h1>`, sub line: `Ideal-core magnetic circuit + air-path Biot–Savart. Dy11. All quantities normalised.` Build-info div identical to lines 161.
- Rail sections: **Fields** (Core flux Φ bundles / Leakage B arrows / Induced E arrows — checkboxes `cF`, `cB`, `cE`), **Structure** (Core `cI` / Primary HV delta `cW1` / Secondary LV wye `cW2` / Connections `cJ`), **Drive** (ωt slider `sT`, speed `sS`, Pause `bPlay`, Front view `bView`), **Load** (slider `sL` 0–100 %), **Readout** table, **What this model does not include** note.
- Scopes strip: `scPhi` (limb fluxes, 330×76) + `scVG` (vector group star, 120×120).
- Scene: renderer/lights/camera/orbit — copy lines 400–483 minus motor-drag hooks (plain orbit only). `renderer.setAnimationLoop(frame)`; XR: `VRButton`, placement group + `HORIZONTAL_ORIENTATION` (transformer stands in x–z; orient so it faces the viewer standing up), stick rotate/scale via `updateXRControls` pattern (lines 1272–1298) with all grab branches removed.
- Static meshes (`buildMeshes()`, run once — geometry never changes):
  - Core: 3 limb cylinders (r = `rCore`, length 2·`limbTop`) + 2 yoke cylinders along x (r = `rCore`, length `limbX[2]−limbX[0]` + 2·rCore) at z = ±`limbTop`, iron material from lines 509–512 (opacity ~0.35, no clipping plane).
  - Windings: per limb, two helical-look tubes — TubeGeometry over a CatmullRom of the loop-stack path from `windingSegs` geometry (primary at `rHV` colored `PHASE_HEX[k]` bright like lines 560–571; secondary at `rLV` same hue, `multiplyScalar(0.5)` dimmer).
  - Connection jumpers (kind `'jumper'`): delta — 3 arc tubes linking HV winding top of limb k to HV bottom of limb (k+1)%3, routed over the top yoke; wye — 3 straight tubes from LV bottoms to a neutral bar under the core; thin (r = 0.02), color `--ink-dim` gray, so topology is visible without shouting.

- [ ] **Step 1: Write failing page tests** — `tests/transformer-page-test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../delta-wye-transformer.html', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('transformer page is self-contained and project-path safe', () => {
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.match(html, /\.\/vendor\/three\.module\.js/);
  assert.match(html, /\.\/vendor\/VRButton\.js/);
  assert.match(html, /\.\/field-kernels\.js/);
  assert.match(html, /\.\/transformer-model\.js/);
});

test('transformer page uses the WebXR-owned animation loop', () => {
  assert.match(html, /renderer\.xr\.enabled\s*=\s*true/);
  assert.match(html, /renderer\.setAnimationLoop\(frame\)/);
  assert.doesNotMatch(html, /requestAnimationFrame\(/);
});

test('transformer page carries the build stamp and is deployed by the workflow', () => {
  assert.match(html, /build <code>__BUILD_HASH__<\/code> · published/);
  assert.match(html, /<time datetime="__BUILD_TIME__">__BUILD_TIME__<\/time>/);
  assert.match(workflow, /delta-wye-transformer\.html/);
  assert.match(workflow, /transformer-model\.js/);
});
```

- [ ] **Step 2: Run to verify failure** (file missing).
- [ ] **Step 3: Build the skeleton** (~450 lines at this stage): chrome + scene + static meshes + orbit + a minimal `frame()` that just renders. Include the `pages.yml` edits here (copy + sed for the new page, copy `transformer-model.js`) so the deployment-wiring test in Step 1 goes green in this task — Task 8 then only extends the workflow for cross-links.
- [ ] **Step 4: Manual smoke** — `python3 -m http.server 8000`, open `/delta-wye-transformer.html`: core + windings + jumpers render, orbit works, VR button present.
- [ ] **Step 5: Run `npm test`** — green.
- [ ] **Step 6: Commit** — `git commit -m "feat: delta-wye transformer page skeleton (chrome, scene, core and winding meshes)"`

---

## Task 6: Field probes, precompute, and animation

**Files:**
- Modify: `delta-wye-transformer.html`

**Interfaces:**
- Consumes: `fieldB`, `fieldA`, `windingSegs`, `fluxLoopSegs`, `fluxBundleSpans`, `solve`, `toWcWs`.
- Produces: per-frame animated core-flux bundles, leakage-B arrows, E arrows; load slider re-blends without recompute.

Precompute (`precompute()`, runs once at init and never again — no veil needed, ~10^4 kernel calls ≈ instant):
- `SOL1 = solve(1)` (full load), `SEGW = windingSegs(SOL1)`, `SEGF = fluxLoopSegs(SOL1)`.
- **B probes**: y = 0 mid-plane grid over x ∈ [−3.4, 3.4], z ∈ [−2.2, 2.2], step 0.22, skipping points inside core or winding annuli — store per probe `(Bc, Bs)` from `fieldB(p, SEGW)`. Load scaling: displayed `B(t) = load · (c·Bc + s·Bs)`.
- **E probes**: rings of 16 around each limb at radius 0.72, z ∈ {−0.9, −0.45, 0, 0.45, 0.9} (mirroring `eProbes` lines 656–670) — store `(Awc, Aws)` from `fieldA(p, SEGW)` (load-scaled part) and `(Acc, Acs)` from `fieldB(p, SEGF)` (core part, load-independent). Displayed `E(t) = ω·[s·(load·Awc + Acc) − c·(load·Aws + Acs)]`.
- References: `Bref` = max |B| over probes at FULL load, t = 0 — a fixed constant, never rescaled from the live load setting, so the load slider visibly grows the leakage arrows; `Eref` = max |E| over probes at no load, t = 0 (core part dominates; guards divide-by-zero like lines 750–755).
- Design review scale check: with these parameters the gap |B| runs ~16–25× the ambient field and |E| near the limbs is within one order of magnitude of gap |B| — single Bref/Eref normalization suffices.
- No field-line tracing on this page, by design: the leakage loops close tightly through bore/gap/outside on a much smaller scale than the motor page's dipole loops, and the walker's closure tolerances don't transfer. Arrows only.

Per-frame (`frame()` additions):
- `c = cos(S.t)`, `s = sin(S.t)`, `load = S.load`.
- Flux bundles: for each span from `fluxBundleSpans()`, 7 parallel line strands inside the core radius; per-frame set color intensity from `|φ(t)|/Φmax` through the existing `FLUX_RAMP` ramp (copy `ramp()` lines 618–629 + `FLUX_RAMP` constant), and one arrowhead per strand mid-span flipping with sign(φ(t)) — arrow-stroke construction copied from `updateParticles` lines 936–946.
- B arrows: shaft+head line-segment arrows at probes (construction from `updateE` lines 967–982), length ∝ |B|/Bref clamped, flux-ramp coloring.
- E arrows: identical construction, violet/orange two-tone by sign of the azimuthal sense like the existing page (`w = ez >= 0 ? ... : ...` line 973 — here keyed on the sign of E·(azimuthal unit vector around the limb)).
- Readout: instantaneous i_s per phase, |φ_k(t)|, load %, `|Imag|/|Ip|`, and the Σφ residual (should print 0.000).

- [ ] **Step 1: Implement precompute + bundle/arrow draw code** (~350 lines).
- [ ] **Step 2: Manual verification against physics** (this is the page's TDD equivalent — the numeric layer is already test-covered): at load = 0, NO B arrows visible, E arrows present and circling limbs; at full load, leakage arrows concentrated in the LV–HV gaps; limb 2's bundle goes dark when φ_2(t) crosses zero while the other two carry opposing flux.
- [ ] **Step 3: Run `npm test`** — green (page tests still structural).
- [ ] **Step 4: Commit** — `git commit -m "feat: transformer field animation (core flux bundles, leakage B, induced E)"`

---

## Task 7: Scopes, readouts, and control wiring

**Files:**
- Modify: `delta-wye-transformer.html`

**Interfaces:**
- Consumes: `solve`, `C`, existing scope-drawing pattern (`drawScopes` lines 1035–1074).

- Flux scope `scPhi`: three sinusoids φ_k(ωt) over two periods with phase dots + cursor, exactly the `drawScopes` current-scope pattern but plotting `wc_k·cos(a) + ws_k·sin(a)` from `toWcWs(PHI[k])`; caption `Limb fluxes φ / Φ̂`.
- Vector-group scope `scVG`: polar star — 6 phasors drawn from center: primary line-line `Up[k]` (dim gray, labeled A B C) and secondary line-line `Vs[k]−Vs[(k+1)%3]` (phase colors), each rotated by +ωt so the star co-rotates; the fixed 30° lead is directly visible. Caption `Vector group Dy11 · sec leads 30°`.
- Controls wiring: `sT`/`sS`/`bPlay`/`bView` clones of lines 1390–1412 (front view = camera on −y axis); `sL` sets `S.load` (0–1), updates readout — no recompute (blend-only, per Task 6); checkbox bindings via the `bindBox` pattern (lines 1381–1389); rail toggle + keydown space (lines 1432–1441); `resize()` (lines 1443–1451).
- Readout table rows: `sec/pri line V` (expect `0.866` for Ns/Np = 0.5), `shift` (`+30.0°`), `i_mag/i_p`, `Σφ residual`, per-phase `i_s`, and primary current shown as BOTH `i_p (winding)` and `i_A (line)` rows — the two differ by √3 and 30° in a delta and conflating them is a standard reader error; label explicitly.

- [ ] **Step 1: Implement scopes + wiring** (~250 lines).
- [ ] **Step 2: Manual smoke** — sliders live, pause/play works, scope cursor tracks ωt, vector-group star shows the 30° offset at any speed, load slider morphs arrows instantly.
- [ ] **Step 3: Run `npm test`; commit** — `git commit -m "feat: transformer scopes (limb fluxes, Dy11 vector group) and controls"`

---

## Task 8: Deployment, cross-links, docs

**Files:**
- Modify: `.github/workflows/pages.yml` (extend the Task 5 edits with sed for the second page), `rotating-field-machine.html` (cross-link), `delta-wye-transformer.html` (cross-link), `README.md`, `tests/pages-test.mjs`

Workflow assemble step (final form of the changed lines — motor page stays `index.html` per the pending user choice; adjust if the user picks a landing page):

```sh
cp rotating-field-machine.html _site/index.html
cp delta-wye-transformer.html _site/delta-wye-transformer.html
build_hash="$(git rev-parse --short=7 HEAD)"
build_time="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
sed -i "s/__BUILD_HASH__/${build_hash}/g; s/__BUILD_TIME__/${build_time}/g" _site/index.html _site/delta-wye-transformer.html
cp xr-controls.js field-kernels.js transformer-model.js _site/
```

Cross-links: in each page's rail header under `.build-info`, a `.sub`-styled line — motor page: `<a href="./delta-wye-transformer.html">also: delta–wye transformer →</a>`; transformer page: `<a href="./index.html">also: rotating field machine →</a>` (relative hrefs keep the self-containment tests happy; note the motor page's dev-server filename differs from its deployed name — link with `./index.html` and accept the dev-mode 404, or link `./rotating-field-machine.html` and have the workflow also copy the motor page under its own name; **do the latter**, it keeps both dev and prod working: add `cp rotating-field-machine.html _site/rotating-field-machine.html` + include it in the sed list).

README: add a "Pages" list (two pages, local URLs, one-line description each) and extend the Verify section to name both verify scripts.

- [ ] **Step 1: Extend page tests** — in `tests/pages-test.mjs` assert the workflow seds both files (`assert.match(workflow, /_site\/delta-wye-transformer\.html/)`); in `tests/transformer-page-test.mjs` assert the cross-link (`assert.match(html, /rotating-field-machine\.html/)`). Run: the second assertion fails.
- [ ] **Step 2: Apply the workflow, cross-link, and README changes.**
- [ ] **Step 3: Run `npm test`** — green.
- [ ] **Step 4: Commit** — `git commit -m "feat: deploy transformer page alongside the machine page with cross-links"`

---

## Task 9: End-to-end verification

- [ ] **Step 1: Full `npm test`** — all node tests + both verify scripts green; paste the summary lines into the completion report.
- [ ] **Step 2: Serve locally** (`python3 -m http.server 8000`) and walk the checklist: both pages load with no console errors; cross-links navigate; transformer at load 0 shows E but no B arrows; load 1 shows window leakage; bundles honor Σφ = 0 visually; pause + ωt scrub consistent between 3-D view, flux scope, and vector-group star; mobile layout (narrow window) shows the rail toggle; `Enter VR` button renders (headset behavior verified structurally by the animation-loop invariant, actual Quest test is a follow-up).
- [ ] **Step 3: Verify the branch** per superpowers:finishing-a-development-branch (PR to main like the repo's existing PR-per-feature history).

---

## Verification (how to test the whole change)

- `npm test` — unit + page invariants + both physics verify scripts (`verify_fields.js` now also guards the shared kernels the transformer uses).
- `node verify_transformer.js` alone for the field-integral suite: duality normalization, Faraday ∮E·dl = −dφ/dt, Ampère on the leakage field, no-load null, field-level Dy11 phase.
- Manual: local server checklist in Task 9; deployed check after merge at `https://thechaosbureau.github.io/em-visuals/delta-wye-transformer.html`.

## Physics design review (completed 2026-08-28)

An adversarial numerical review verified: the flux-tube duality with weight Φ/(4π) (∮A·dl = Φ exact); the Dy11 conventions (+30° lead, √3·Ns/Np ratio, ΣΦ = 0, delta line-current KCL); the mesh-flux decomposition (φL = φ1, φR = −φ3, shared-limb superposition exact); and the visual scale sanity (single Bref/Eref suffices). It corrected two things, both folded in above: the balanced pair has a net *dipole* far field with m_z = NI·π(rHV² − rLV²) per limb (not a quadrupole), and an xy-plane Ampère circle around a limb is a vacuous test (replaced by the limb-axis MMF-balance null, check 5).

## Open items (user choices)

1. **Deployed layout** — motor page stays `index.html` + transformer beside it (recommended, URL-stable) vs. a new landing `index.html` linking both.
2. **XR scope** — view-only XR (recommended: VRButton + stick rotate/scale, no grab) vs. no XR on the new page.
