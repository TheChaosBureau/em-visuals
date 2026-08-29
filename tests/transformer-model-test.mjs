import test from 'node:test';
import assert from 'node:assert/strict';
import { GEOM, windingSegs, fluxLoopSegs, fluxBundleSpans, solve, C, ELEC, toWcWs } from '../transformer-model.js';

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
