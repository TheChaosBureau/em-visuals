import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, potentialAt, flowAt, powerAt, energyAt, chargeAt, voltSecondsAt, meanPower, rms,
  faces, sliceCount, slices, slicedEnergy, backflowFraction
} from '../power-box-model.js';

const TAU = Math.PI * 2, deg = d => d * Math.PI / 180;
const close = (actual, expected, tol, message = '') => assert.ok(Math.abs(actual - expected) <= tol, `${message}: ${actual} vs ${expected}`);
const steady = { ...DEFAULTS };
const sine = (phiDeg = 0, extra = {}) => ({ ...DEFAULTS, mode: 1, phi: deg(phiDeg), ...extra });

// Simpson's rule, as an independent check on the closed forms.
function integrate(f, a, b, n = 4000) {
  const h = (b - a) / n;
  let sum = f(a) + f(b);
  for (let k = 1; k < n; k++) sum += f(a + k * h) * (k % 2 ? 4 : 2);
  return sum * h / 3;
}

test('worked numbers: 12 V, 2 A, 3 s give 24 W, 6 C, 36 V·s and 72 J', () => {
  assert.deepEqual({ ...DEFAULTS }, { potential: 12, flow: 2, duration: 3, mode: 0, phi: 0, frequency: 1 });
  const f = faces(steady);
  close(f.power, 24, 1e-12, 'power');
  close(f.charge, 6, 1e-12, 'charge');
  close(f.voltSeconds, 36, 1e-12, 'volt-seconds');
  close(f.energy, 72, 1e-12, 'energy');
});

test('instantaneous power is the product of potential and flow', () => {
  for (const t of [0, 0.4, 1.7, 3]) {
    assert.equal(potentialAt(steady, t), 12);
    assert.equal(flowAt(steady, t), 2);
    assert.equal(powerAt(steady, t), 24);
  }
  for (const phiDeg of [0, 30, 90, 150]) {
    const p = sine(phiDeg), w = TAU * p.frequency;
    for (const t of [0, 0.07, 0.25, 0.4, 0.81, 2.3]) {
      close(potentialAt(p, t), 12 * Math.cos(w * t), 1e-12, 'v(t)');
      close(flowAt(p, t), 2 * Math.cos(w * t - p.phi), 1e-12, 'i(t)');
      close(powerAt(p, t), potentialAt(p, t) * flowAt(p, t), 0, 'p = v·i');
      close(powerAt(p, t), 12 * (Math.cos(p.phi) + Math.cos(2 * w * t - p.phi)), 1e-11, 'double-frequency form');
    }
  }
  close(powerAt(sine(0), 0), 24, 1e-12, 'peak power in phase');
  close(powerAt(sine(0), 0.25), 0, 1e-12, 'zero a quarter cycle later');
  assert.ok(powerAt(sine(90), 0.3) < 0, 'power runs backward for part of the cycle when out of phase');
});

test('steady energy accumulates as V·I·t', () => {
  for (const [potential, flow] of [[12, 2], [5, 0.5], [24, 4], [0, 3]])
    for (const t of [0, 0.5, 1, 2.75, 3, 6]) {
      const p = { ...DEFAULTS, potential, flow, duration: 6 };
      close(energyAt(p, t), potential * flow * t, 1e-12, `E(${t})`);
      close(chargeAt(p, t), flow * t, 1e-12, 'charge');
      close(voltSecondsAt(p, t), potential * t, 1e-12, 'volt-seconds');
    }
});

test('sinusoidal energy over whole cycles is V_rms · I_rms · cos φ · T', () => {
  for (const phiDeg of [0, 30, 60, 90, 120, 180])
    for (const frequency of [0.5, 1, 2])
      for (const cycles of [1, 2, 3]) {
        const p = sine(phiDeg, { frequency }), T = cycles / frequency;
        const expected = rms(p.potential) * rms(p.flow) * Math.cos(p.phi) * T;
        close(energyAt(p, T), expected, 1e-10, `φ=${phiDeg}° f=${frequency} cycles=${cycles}`);
        close(meanPower(p) * T, expected, 1e-10, 'mean power × time');
      }
  close(energyAt(sine(0), 3), 36, 1e-10, 'in phase: half the steady 72 J');
  close(energyAt(sine(90), 3), 0, 1e-10, 'quarter-cycle offset: nothing delivered');
  close(energyAt(sine(180), 3), -36, 1e-10, 'half-cycle offset: all of it flows back');
});

test('closed-form integrals agree with numerical integration at any time, phase and blend', () => {
  for (const mode of [0, 0.3, 0.5, 0.8, 1])
    for (const phiDeg of [0, 45, 90, 135])
      for (const t of [0.2, 0.9, 1.37, 3]) {
        const p = { ...DEFAULTS, mode, phi: deg(phiDeg), frequency: 0.8 };
        close(energyAt(p, t), integrate(s => powerAt(p, s), 0, t), 1e-8, `energy mode=${mode} φ=${phiDeg}° t=${t}`);
        close(chargeAt(p, t), integrate(s => flowAt(p, s), 0, t), 1e-9, 'charge');
        close(voltSecondsAt(p, t), integrate(s => potentialAt(p, s), 0, t), 1e-9, 'volt-seconds');
      }
  const dc = { ...DEFAULTS, mode: 1, frequency: 0, phi: deg(60) };
  close(energyAt(dc, 2), 12 * 2 * Math.cos(deg(60)) * 2, 1e-12, 'zero-frequency limit');
});

test('the drawn solid has the volume of the accumulated energy, in both modes', () => {
  // steady: one box from the origin to the playhead, exact at any playhead
  for (const upTo of [0.4, 1, 2.2, 3]) {
    const list = slices(steady, upTo);
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].t0, list[0].t1, list[0].absV, list[0].absI, list[0].negative], [0, upTo, 12, 2, false]);
    close(slicedEnergy(list), energyAt(steady, upTo), 1e-12, `steady to ${upTo}s`);
    close(slicedEnergy(list), 12 * 2 * upTo, 1e-12, 'V·I·t');
  }
  // the same steady values cut into slices still add up to the same volume
  for (const upTo of [0.4, 2.2, 3]) {
    const barely = { ...steady, mode: 1e-12 }, list = slices(barely, upTo);
    assert.ok(list.length > 1);
    close(slicedEnergy(list), 12 * 2 * upTo, 1e-9, `sliced steady to ${upTo}s`);
  }
  // sinusoidal over whole cycles: the midpoint sum is exact for the double-frequency ripple
  for (const phiDeg of [0, 37, 90, 120, 180]) {
    const p = sine(phiDeg), list = slices(p);
    assert.equal(list.length, sliceCount(p));
    close(slicedEnergy(list), energyAt(p, p.duration), 1e-10, `sinusoid φ=${phiDeg}°`);
    close(slicedEnergy(list), rms(12) * rms(2) * Math.cos(p.phi) * 3, 1e-10, 'V_rms·I_rms·cos φ·T');
  }
  // partway through a cycle the slices follow the running integral closely
  for (const upTo of [0.33, 0.8, 1.61, 2.5]) {
    const p = sine(50);
    close(slicedEnergy(slices(p, upTo)), energyAt(p, upTo), 0.12, `sinusoid to ${upTo}s`);
  }
});

test('slices carry |v| × |i| and are flagged where the product is negative', () => {
  const p = sine(60), list = slices(p);
  let negative = 0;
  for (const s of list) {
    assert.ok(s.absV >= 0 && s.absI >= 0);
    close(s.absV, Math.abs(potentialAt(p, s.tm)), 0, '|v| at mid-slice');
    close(s.absI, Math.abs(flowAt(p, s.tm)), 0, '|i| at mid-slice');
    assert.equal(s.negative, s.v * s.i < 0);
    close(Math.abs(s.volume), s.absV * s.absI * (s.t1 - s.t0), 1e-12, 'slice volume is its cross-section × thickness');
    assert.equal(Math.sign(s.volume), s.negative ? -1 : 1);
    if (s.negative) negative++;
  }
  close(negative / list.length, 60 / 180, 1 / 32, 'share of negative slices');
  assert.equal(slices(sine(0)).filter(s => s.negative).length, 0, 'in phase nothing flows back');
  assert.equal(slices(steady, 0).length, 0, 'nothing is drawn before time starts');
  const part = slices(steady, 1.01);
  assert.equal(part.at(-1).t1, 1.01, 'the last slice stops at the playhead');
  assert.ok(sliceCount(sine(0, { frequency: 3, duration: 6 })) <= 240 && sliceCount(steady) >= 48);
});

test('power is negative for φ/π of each cycle', () => {
  for (const phiDeg of [0, 15, 30, 45, 60, 90, 120, 150, 180]) {
    const expected = phiDeg / 180;
    close(backflowFraction(sine(phiDeg)), expected, 2e-4, `φ=${phiDeg}°`);
    close(backflowFraction(sine(phiDeg, { frequency: 2.5 })), expected, 2e-4, `φ=${phiDeg}° at 2.5 Hz`);
  }
  assert.equal(backflowFraction(steady), 0);
  assert.equal(backflowFraction({ ...DEFAULTS, mode: 0.4, phi: deg(90) }), 0, 'a ripple that never crosses zero never flows back');
});
