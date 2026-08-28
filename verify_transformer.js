// Field-integral verification for the delta-wye transformer model: confirms
// the flux-tube duality (A of the core computed via fieldB on fluxLoopSegs),
// Maxwell constraints on the assembled fields, Faraday's law sign, and the
// field picture's agreement with the circuit solve.
//
// Units: mu0*I*N/(4*pi) = 1 (same convention as field-kernels.js / verify_fields.js).

import { fieldB, fieldA } from './field-kernels.js';
import { ELEC, GEOM, C, toWcWs, solve, windingSegs, fluxLoopSegs } from './transformer-model.js';

const TAU = Math.PI * 2;

// -------------------------------------------------------------- test helpers
const nrm = v => Math.hypot(v[0], v[1], v[2]);
let pass = 0, fail = 0;
function check(name, got, want, tol, extra) {
  const ok = Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name.padEnd(58)} got ${got.toExponential(4)}  want ${want.toExponential(4)}${extra ? '   ' + extra : ''}`);
}

function divergence(fn, p, h) {
  let d = 0;
  for (let i = 0; i < 3; i++) {
    const pp = p.slice(), pm = p.slice();
    pp[i] += h; pm[i] -= h;
    d += (fn(pp)[i] - fn(pm)[i]) / (2 * h);
  }
  return d;
}
function curl(fn, p, h) {
  const d = [];
  for (let i = 0; i < 3; i++) {
    const pp = p.slice(), pm = p.slice();
    pp[i] += h; pm[i] -= h;
    const a = fn(pp), b = fn(pm);
    d.push([(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h), (a[2] - b[2]) / (2 * h)]);
  }
  // d[i][j] = d F_j / d x_i
  return [d[1][2] - d[2][1], d[2][0] - d[0][2], d[0][1] - d[1][0]];
}

// Time-reconstruction from a 6-channel [Xc, Xs] kernel result.
const timeAt = (F, t) => [
  Math.cos(t) * F[0] + Math.sin(t) * F[3],
  Math.cos(t) * F[1] + Math.sin(t) * F[4],
  Math.cos(t) * F[2] + Math.sin(t) * F[5],
];
// E = -dA/dt = omega*(sin(t)*Ac - cos(t)*As)
const eFromF = (F, t, omega) => [
  omega * (Math.sin(t) * F[0] - Math.cos(t) * F[3]),
  omega * (Math.sin(t) * F[1] - Math.cos(t) * F[4]),
  omega * (Math.sin(t) * F[2] - Math.cos(t) * F[5]),
];

const Bat = (p, SEG, t) => timeAt(fieldB(p[0], p[1], p[2], SEG), t);
// Phase-robust field amplitude: sqrt(|Xc|^2+|Xs|^2) over both channels, so a
// point isn't accidentally sampled near a per-limb current zero-crossing.
const ampB = (p, SEG) => { const F = fieldB(p[0], p[1], p[2], SEG); return Math.hypot(F[0], F[1], F[2], F[3], F[4], F[5]); };
const AcoreRaw = (p, SEGflux) => fieldB(p[0], p[1], p[2], SEGflux);   // duality: A of core flux via fieldB
const EcoreAt = (p, SEGflux, t) => eFromF(fieldB(p[0], p[1], p[2], SEGflux), t, ELEC.omega);
const EwindAt = (p, SEGwind, t) => eFromF(fieldA(p[0], p[1], p[2], SEGwind), t, ELEC.omega);
const Etotal = (p, SEGflux, SEGwind, t) => {
  const ec = EcoreAt(p, SEGflux, t), ew = EwindAt(p, SEGwind, t);
  return [ec[0] + ew[0], ec[1] + ew[1], ec[2] + ew[2]];
};

// Dense midpoint-rule circulation of a vector field around a horizontal
// (constant-z) circle of radius r centred at (cx, cy0), traversed CCW when
// viewed from +z (increasing angle theta), matching the winding-sense
// convention in transformer-model.js (positive current -> +z flux).
function circleCirculation(vecFn, cx, cy0, z, r, N = 2000) {
  let s = 0;
  const dth = TAU / N;
  for (let i = 0; i < N; i++) {
    const th = (i + 0.5) * dth;
    const x = cx + r * Math.cos(th), y = cy0 + r * Math.sin(th);
    const F = vecFn(x, y, z);
    const dlx = -r * Math.sin(th) * dth, dly = r * Math.cos(th) * dth;
    s += F[0] * dlx + F[1] * dly;
  }
  return s;
}

// ================================================================== TEST RUN

// -- 1. duality normalization -------------------------------------------
console.log('1. Duality normalization: unit-flux loop via fieldB, A-circulation = Phi');
{
  // Drives the PRODUCTION fluxLoopSegs itself (not a standalone rectangle),
  // so this check actually gates transformer-model.js's 1/(4*pi) constant --
  // a synthetic rectangle with its own hardcoded weight would verify the
  // fieldB kernel's circulation but could never fail if fluxLoopSegs' own
  // constant regressed (e.g. to 1/(2*pi)). fluxLoopSegs only consumes
  // sol.PHI, so a minimal synthetic sol suffices: mesh L (limb 0 - limb 1)
  // carries Phi[0] = 1 (unit flux, real), mesh R carries Phi[2] = 0 (inert).
  const sol = { PHI: [[1, 0], [0, 0], [0, 0]] };
  const SEGflux = fluxLoopSegs(sol);
  const { limbX } = GEOM;
  const Avec = (x, y, z) => AcoreRaw([x, y, z], SEGflux).slice(0, 3);

  const linked = circleCirculation(Avec, limbX[0], 0, 0, 0.3);
  check('A-circulation linking limb 0 (mesh L left leg) = Phi', linked, 1.0, 0.01);

  const midX = 0.5 * (limbX[0] + limbX[1]);   // mesh L interior, no leg nearby
  const unlinked = circleCirculation(Avec, midX, 0, 0, 0.3);
  check('A-circulation NOT linking any leg (mesh-L interior point) = 0', unlinked, 0, 0.01);
}

// -- 2. curl A_core = 0 and div A_core = 0 off the skeleton ------------------
console.log('\n2. curl A_core = 0, div A_core = 0 off the flux skeleton');
{
  const sol = solve(1);
  const SEGflux = fluxLoopSegs(sol);
  const f = p => AcoreRaw(p, SEGflux).slice(0, 3);   // cos-channel snapshot
  // Skeleton is the two mesh rectangles in the y=0 plane, x in {-2.2, 0, 2.2},
  // z in [-1.6, 1.6]. Pick probe points >= 0.4 from every leg/yoke segment.
  const pts = [[0.3, 0.5, 0.2], [-1.1, 0.6, -0.5], [2.5, 0.55, 0.3], [0.5, -0.6, 1.0], [-2.2, 0.45, 0]];
  for (const p of pts) {
    const scale = nrm(f(p));
    check(`div A_core at (${p})`, divergence(f, p, 1e-3) / scale, 0, 5e-3);
    check(`|curl A_core| at (${p})`, nrm(curl(f, p, 1e-3)) / scale, 0, 5e-3);
  }
}

// -- 3. Faraday closes the loop (E sign guard) -------------------------------
console.log('\n3. Faraday: loop(E)·dl around limb k = -d(phi_k)/dt(t)  (sum of core+winding parts)');
// Tolerance note: the winding part is not exactly null on this loop (radius
// rLV, coincident with the secondary coil's own radius) -- primary+secondary
// ampere-turns cancel exactly, but nLoops=12 discrete rings approximate a
// continuous solenoid current sheet only to O(ring spacing): refining the
// ring spacing (holding solenoid length fixed, so turn density increases)
// drives the residual down roughly linearly in spacing (~10.95% at spacing
// 0.20 -> ~1.88% at spacing 0.025); holding turn density fixed while varying
// length instead does NOT shrink it (plateaus ~11%), so the dominant
// mechanism is ring-count discretization of nLoops=12, not solenoid length.
// Core-only matches the Faraday relation to 1e-13 exactly, confirming this is
// finite-geometry leakage, not a sign/4pi bug. Tolerance loosened 2% -> 7% of
// |PHI_k| to absorb this leakage (observed max ~6.3%) while still catching a
// sign flip.
{
  const sol = solve(1);
  const SEGflux = fluxLoopSegs(sol);
  const SEGwind = windingSegs(sol);
  const { limbX, rLV } = GEOM;
  for (const t of [0, 0.9, 2.1]) {
    for (let k = 0; k < 3; k++) {
      const [wc, ws] = toWcWs(sol.PHI[k]);
      const want = wc * Math.sin(t) - ws * Math.cos(t);   // -d(phi_k)/dt
      const vecFn = (x, y, z) => Etotal([x, y, z], SEGflux, SEGwind, t);
      const got = circleCirculation(vecFn, limbX[k], 0, 0, rLV);
      const scale = Math.max(C.abs(sol.PHI[k]), 1e-6);
      check(`loop(E)·dl limb ${k} @ t=${t}`, got, want, 0.07 * scale);
    }
  }
}

// -- 4. No-load null: balanced pair vanishes ---------------------------------
console.log('\n4. No-load: windingSegs weights vanish, B = 0 across the window');
{
  const sol0 = solve(0);
  const SEGwind = windingSegs(sol0);
  let netC = 0, netS = 0;
  for (let i = 6; i < SEGwind.length; i += 8) { netC += Math.abs(SEGwind[i]); netS += Math.abs(SEGwind[i + 1]); }
  check('sum |wc| over windingSegs (no-load)', netC, 0, 1e-12);
  check('sum |ws| over windingSegs (no-load)', netS, 0, 1e-12);

  let maxB = 0;
  for (let i = 0; i < 50; i++) {
    const gx = ((i * 0.61803398875) % 1) * 6.4 - 3.2;
    const gy = ((i * 0.41803398875) % 1) * 2 - 1;
    const gz = ((i * 0.31803398875) % 1) * 3.2 - 1.6;
    maxB = Math.max(maxB, nrm(Bat([gx, gy, gz], SEGwind, 0)));
  }
  check('max |B| over 50 window sample points (no-load)', maxB, 0, 1e-12);
}

// -- 5. MMF-balance null on the limb axis (full load) ------------------------
console.log('\n5. Full load: opposing solenoid fields cancel on the limb axis inside the LV bore');
// Uses the phase-robust amplitude ampB (both channels combined) rather than a
// single-t snapshot: with 3-phase currents, a fixed t can land near limb k's
// own zero-crossing while neighbouring limbs are near peak, making a t=0
// magnitude ratio noisy/misleading even though the physics is fine. Observed
// ratio is consistent across all limbs/z, max 4.863% (limb 2, z=0) -- so the
// 5% target is loosened minimally to 6% to absorb finite-geometry rounding.
{
  const sol = solve(1);
  const SEGwind = windingSegs(sol);
  const { limbX, rLV, rHV } = GEOM;
  const rGap = 0.5 * (rLV + rHV);
  for (let k = 0; k < 3; k++) {
    for (const z of [0, 0.3]) {   // both well inside |z| < 0.6*windHalf = 0.66 (windHalf=1.1)
      const bAxis = ampB([limbX[k], 0, z], SEGwind);
      const bGap = ampB([limbX[k] + rGap, 0, z], SEGwind);
      check(`|B|axis / |B|gap limb ${k} z=${z.toFixed(3)}`, bAxis / Math.max(bGap, 1e-15), 0, 0.06, `bAxis=${bAxis.toExponential(2)} bGap=${bGap.toExponential(2)}`);
    }
  }
}

// -- 6. Leakage far field is the sum of three limb dipoles -------------------
console.log('\n6. Exterior field matches superposed limb dipoles (m_z,k = Ns*is_k(0)*pi*(rHV^2-rLV^2))');
// Tolerance note: windingSegs draws each turn as a segsPerLoop-gon, not a
// true circle, so its enclosed area (and hence its dipole moment) is smaller
// than pi*r^2 by the regular-polygon area ratio N*sin(2*pi/N)/(2*pi); for
// N=24 that is ~0.988616, i.e. a ~1.14% deficit -- this, not floating-point
// precision, is what an uncorrected point-dipole comparison floors out at
// (confirmed: substituting a Float64Array copy of windingSegs' output gives
// bit-identical errors at every radius, ruling out Float32Array precision).
// mz is corrected below by that exact polygon-area factor (computed from
// GEOM.segsPerLoop, not hardcoded); after correction the residual R=16 error
// is ~1.3% (tol restored to 2%). R=8 keeps a small loosening to 7% for the
// next-order multipole term, which at R=8 (only ~3.6x the limb spacing) is
// not yet negligible.
{
  const sol = solve(1);
  const SEGwind = windingSegs(sol);
  const { limbX, rLV, rHV, segsPerLoop } = GEOM;
  const isAt0 = sol.Is.map(is => toWcWs(is)[0]);   // is_k(0) = Re(Is[k])
  const polyAreaFactor = segsPerLoop * Math.sin(TAU / segsPerLoop) / TAU;   // regular N-gon area / pi*r^2
  const mz = isAt0.map(i0 => ELEC.Ns * i0 * Math.PI * (rHV * rHV - rLV * rLV) * polyAreaFactor);
  const centers = limbX.map(x => [x, 0, 0]);

  const dipoleB = (p) => {
    const b = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const rx = p[0] - centers[k][0], ry = p[1] - centers[k][1], rz = p[2] - centers[k][2];
      const r = Math.hypot(rx, ry, rz), r3 = r * r * r;
      const mrHat = mz[k] * rz / r;   // m_k = [0,0,mz[k]], m.rhat = mz*rz/r
      b[0] += (3 * mrHat * rx / r) / r3;
      b[1] += (3 * mrHat * ry / r) / r3;
      b[2] += (3 * mrHat * rz / r - mz[k]) / r3;
    }
    return b;
  };

  for (const R of [8, 16]) {
    for (const dir of [[1, 0, 0], [0, 0, 1], [0.6, 0.8, 0]]) {
      const p = dir.map(c => c * R);
      const b = Bat(p, SEGwind, 0);
      const bd = dipoleB(p);
      const err = Math.hypot(b[0] - bd[0], b[1] - bd[1], b[2] - bd[2]) / Math.max(nrm(bd), 1e-15);
      check(`R=${R} dir=[${dir}] rel err vs 3-dipole superposition`, err, 0, R === 8 ? 0.07 : 0.02);
    }
  }
}

// -- 7. Field-level Dy11: phase of loop(E) around limb 0 vs the circuit ------
console.log('\n7. Field-level Dy11: phase of loop(E) around limb 0 vs the circuit EMF phasor');
// Uses no-load (windingSegs weights are exactly zero, per check 4) so the
// combined E is exactly the core part -- isolating the field/circuit phase
// tie from the winding-leakage tolerance issue already characterised in
// check 3 (PHI is independent of load, so this is still a full test of the
// field-circuit correspondence). Target is arg(-j*omega*Phi[0]): check 3
// establishes loop(E)·dl = -d(phi)/dt, i.e. its phasor is -j*omega*Phi, not
// +j*omega*Phi -- so the circuit-side comparison must carry that same,
// already-verified minus sign to stay consistent (confirmed exactly:
// core-only phase matches arg(-j*omega*Phi[0]) to <1e-10 deg, and is exactly
// 180 deg from arg(+j*omega*Phi[0])).
{
  const sol = solve(0);
  const SEGflux = fluxLoopSegs(sol);
  const SEGwind = windingSegs(sol);
  const { limbX, rLV } = GEOM;
  const circ = t => circleCirculation((x, y, z) => Etotal([x, y, z], SEGflux, SEGwind, t), limbX[0], 0, 0, rLV);

  const g0 = circ(0), g1 = circ(Math.PI / 2);       // g(t) = g0*cos(t) + g1*sin(t)
  const phaseField = Math.atan2(-g1, g0) * 180 / Math.PI;   // phasor = [g0, -g1]

  const emfPhasor = C.scale(C.mul([0, ELEC.omega], sol.PHI[0]), -1);   // -j*omega*Phi[0]
  const phaseCircuit = C.arg(emfPhasor) * 180 / Math.PI;

  let diff = phaseField - phaseCircuit;
  diff = ((diff + 180) % 360 + 360) % 360 - 180;   // wrap to [-180, 180)
  check('phase(loop E, limb 0) vs arg(-j*omega*Phi[0]) [deg]', diff, 0, 1);
}

// -- 8. Kernel allocation contract -------------------------------------------
console.log('\n8. fieldB / fieldA return fresh buffers (no shared-buffer regression)');
{
  const sol = solve(1);
  const SEGwind = windingSegs(sol);
  const b = fieldB(0.5, 0.3, 0.2, SEGwind);
  const snapshot = Array.from(b);
  fieldA(0.5, 0.3, 0.2, SEGwind);   // must not mutate `b`
  let maxdiff = 0;
  for (let i = 0; i < 6; i++) maxdiff = Math.max(maxdiff, Math.abs(b[i] - snapshot[i]));
  check('fieldB result unchanged after a subsequent fieldA call', maxdiff, 0, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
