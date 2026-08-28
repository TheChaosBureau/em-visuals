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
