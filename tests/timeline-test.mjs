import test from 'node:test';
import assert from 'node:assert/strict';
import { EASINGS, ease, createTimeline, stateAt, cueAlpha, frameCount, shortSideFov, loadTimeline } from '../timeline.js';

const close = (actual, expected, tol = 1e-9, message = '') => assert.ok(Math.abs(actual - expected) <= tol, `${message} ${actual} vs ${expected}`);
const closeVec = (actual, expected, tol = 1e-9) => expected.forEach((x, i) => close(actual[i], x, tol, `component ${i}`));

const raw = {
  duration: 10,
  camera: [
    { t: 2, position: [0, 0, 10], target: [0, 0, 0], fov: 30 },
    { t: 6, position: [10, 0, 0], fov: 40 },
    { t: 8, position: [10, 0, 4], target: [0, 0, 4], path: 'line', ease: 'ease-in-out' }
  ],
  params: {
    ramp: [[1, 10], [3, 20]],
    eased: [{ t: 0, value: 0 }, { t: 4, value: 8, ease: 'ease-in-out' }],
    held: [[0, 1], [5, 2, 'hold'], [6, 3, 'hold']],
    constant: 7
  },
  cues: [
    { type: 'caption', in: 1, out: 4, text: 'first' },
    { type: 'label', in: 0, out: 10, fade: 0, anchor: 'edge', title: 'potential', text: '{potential}' },
    { type: 'equation', in: 3, out: 9, fade: 1, text: 'p = v × i' }
  ]
};
const tl = createTimeline(raw);

test('every easing starts at 0 and ends at 1', () => {
  for (const name of Object.keys(EASINGS)) {
    assert.equal(ease(name, 0), 0, name);
    assert.equal(ease(name, 1), 1, name);
    assert.equal(ease(name, -5), 0, name);
    assert.equal(ease(name, 5), 1, name);
  }
  assert.equal(ease('linear', 0.25), 0.25);
  assert.equal(ease('ease-in-out', 0.5), 0.5);
  assert.ok(ease('ease-in-out', 0.25) < 0.25 && ease('ease-in-out', 0.75) > 0.75);
  assert.ok(ease('ease-in', 0.5) < 0.5 && ease('ease-out', 0.5) > 0.5);
  for (const name of ['linear', 'ease-in', 'ease-out', 'ease-in-out'])
    for (let u = 0.05; u < 1; u += 0.05) assert.ok(ease(name, u) > ease(name, u - 0.05), `${name} is monotonic`);
  assert.throws(() => ease('bounce', 0.5), RangeError);
});

test('numeric tracks interpolate between keys', () => {
  close(tl.stateAt(2).params.ramp, 15);
  close(tl.stateAt(1.5).params.ramp, 12.5);
  close(tl.stateAt(2).params.eased, 4);
  assert.ok(tl.stateAt(1).params.eased < 2, 'ease-in-out starts slowly');
  assert.ok(tl.stateAt(3).params.eased > 6, 'ease-in-out ends slowly');
  assert.equal(tl.stateAt(4.99).params.held, 1);
  assert.equal(tl.stateAt(5).params.held, 2);
  assert.equal(tl.stateAt(5.5).params.held, 2);
  assert.equal(tl.stateAt(6).params.held, 3);
  assert.equal(tl.stateAt(3.3).params.constant, 7);
});

test('tracks clamp before the first key and after the last', () => {
  for (const t of [-100, 0, 1]) assert.equal(tl.stateAt(t).params.ramp, 10);
  for (const t of [3, 9, 1e6]) assert.equal(tl.stateAt(t).params.ramp, 20);
  closeVec(tl.stateAt(-1).camera.position, [0, 0, 10]);
  closeVec(tl.stateAt(0).camera.position, [0, 0, 10]);
  assert.equal(tl.stateAt(0).camera.fov, 30);
  closeVec(tl.stateAt(99).camera.position, [10, 0, 4]);
  closeVec(tl.stateAt(99).camera.target, [0, 0, 4]);
  assert.equal(tl.stateAt(99).camera.fov, 40);
});

test('camera keys orbit the target; "line" moves straight', () => {
  const mid = tl.stateAt(4).camera;                       // halfway from +Z to +X
  closeVec(mid.position, [Math.SQRT1_2 * 10, 0, Math.SQRT1_2 * 10]);
  close(Math.hypot(...mid.position), 10, 1e-9, 'distance is held through the swing');
  close(mid.fov, 35);
  assert.deepEqual(mid.up, [0, 1, 0]);
  const line = tl.stateAt(7).camera;                      // ease-in-out is 0.5 at the midpoint
  closeVec(line.position, [10, 0, 2]);
  closeVec(line.target, [0, 0, 2]);
});

test('orbit keys keep their azimuth as written; position keys take the short way', () => {
  const orbit = createTimeline({ duration: 4, camera: [
    { t: 0, target: [1, 2, 3], orbit: { azimuth: -170, elevation: 0, distance: 5 } },
    { t: 4, orbit: { azimuth: 190, elevation: 30, distance: 5 } }
  ] });
  const half = orbit.stateAt(2).camera;                    // azimuth 10°, elevation 15°
  const az = 10 * Math.PI / 180, el = 15 * Math.PI / 180;
  closeVec(half.position, [1 + 5 * Math.cos(el) * Math.sin(az), 2 + 5 * Math.sin(el), 3 + 5 * Math.cos(el) * Math.cos(az)]);
  const short = createTimeline({ duration: 4, camera: [
    { t: 0, target: [0, 0, 0], position: [-1, 0, -5] },
    { t: 4, position: [1, 0, -5] }
  ] });
  assert.ok(short.stateAt(2).camera.position[2] < -5, 'passes behind the target, not all the way round the front');
  const zUp = createTimeline({ duration: 2, up: [0, 0, 1], camera: [
    { t: 0, target: [0, 0, 0], orbit: { azimuth: 0, elevation: 0, distance: 3 } },
    { t: 2, orbit: { azimuth: 90, elevation: 0, distance: 3 } }
  ] });
  closeVec(zUp.stateAt(0).camera.position, [3, 0, 0]);
  closeVec(zUp.stateAt(2).camera.position, [0, 3, 0]);
  assert.deepEqual(zUp.stateAt(1).camera.up, [0, 0, 1]);
});

test('cues are visible between in and out and fade at both ends', () => {
  const ids = t => tl.stateAt(t).cues.map(c => c.id);
  assert.deepEqual(ids(0.5), ['label-1']);
  assert.deepEqual(ids(2), ['caption-0', 'label-1']);
  assert.deepEqual(ids(5), ['label-1', 'equation-2']);
  assert.deepEqual(ids(9.5), ['label-1']);
  const caption = tl.cues[0];
  assert.equal(cueAlpha(caption, 1), 0);
  assert.equal(cueAlpha(caption, 2.5), 1);
  close(cueAlpha(caption, 1.2), 0.5);
  close(cueAlpha(caption, 3.8), 0.5);
  assert.equal(cueAlpha(caption, 4), 0);
  assert.equal(cueAlpha(tl.cues[1], 0), 1, 'fade 0 is a hard cut');
  assert.equal(tl.stateAt(2).cues[1].text, '{potential}');
});

test('stateAt is pure: any order, any number of calls, same answer', () => {
  const times = [];
  for (let n = 0; n <= 300; n++) times.push(n / 30);
  const forward = times.map(t => JSON.stringify(tl.stateAt(t)));
  const backward = [...times].reverse().map(t => JSON.stringify(tl.stateAt(t))).reverse();
  assert.deepEqual(backward, forward);
  const shuffled = times.map((t, i) => [t, (i * 7919) % times.length]).sort((a, b) => a[1] - b[1]);
  for (const [t] of shuffled) assert.equal(JSON.stringify(stateAt(tl, t)), forward[Math.round(t * 30)]);
  assert.equal(JSON.stringify(tl.stateAt(4.2)), JSON.stringify(tl.stateAt(4.2)));
  assert.notEqual(tl.stateAt(4.2), tl.stateAt(4.2), 'each call returns a fresh object');
  const state = tl.stateAt(4);
  state.params.ramp = -1; state.camera.position[0] = 999; state.cues.length = 0;
  assert.equal(tl.stateAt(4).params.ramp, 20, 'mutating a result does not leak into the timeline');
  close(tl.stateAt(4).camera.position[0], Math.SQRT1_2 * 10);
  assert.ok(Object.isFrozen(tl) && Object.isFrozen(tl.camera[0].position) && Object.isFrozen(tl.params.ramp[0]));
});

test('a timeline without a camera track leaves the camera alone', () => {
  const bare = createTimeline({ duration: 1, params: { x: [[0, 0], [1, 1]] } });
  assert.equal(bare.stateAt(0.5).camera, null);
  close(bare.stateAt(0.5).params.x, 0.5);
  assert.deepEqual(bare.stateAt(0.5).cues, []);
});

test('malformed timelines are rejected with a reason', () => {
  assert.throws(() => createTimeline(null), TypeError);
  assert.throws(() => createTimeline({ duration: 0 }), /duration/);
  assert.throws(() => createTimeline({ duration: 1, params: { x: [[1, 0], [1, 2]] } }), /increase/);
  assert.throws(() => createTimeline({ duration: 1, params: { x: [[0, 0, 'wobble']] } }), /easing/);
  assert.throws(() => createTimeline({ duration: 1, camera: [{ t: 0, position: [0, 0, 1] }] }), /target/);
  assert.throws(() => createTimeline({ duration: 1, camera: [{ t: 0, target: [0, 0, 0] }] }), /position or an orbit/);
  assert.throws(() => createTimeline({ duration: 1, cues: [{ type: 'subtitle', in: 0, out: 1, text: 'x' }] }), /type/);
  assert.throws(() => createTimeline({ duration: 1, cues: [{ type: 'caption', in: 2, out: 1, text: 'x' }] }), /in < out/);
  assert.throws(() => createTimeline({ duration: 1, cues: [{ type: 'label', in: 0, out: 1, text: 'x' }] }), /anchor/);
});

test('frame count and short-side field of view', () => {
  assert.equal(frameCount(tl, 30), 300);
  assert.equal(frameCount(createTimeline({ duration: 20, fps: 30 })), 600);
  assert.equal(shortSideFov(30, 16 / 9), 30);
  assert.equal(shortSideFov(30, 1), 30);
  // in a 9:16 frame the horizontal field of view is the scripted angle
  const vertical = shortSideFov(30, 9 / 16), rad = Math.PI / 180;
  close(2 * Math.atan(Math.tan(vertical * rad / 2) * 9 / 16) / rad, 30, 1e-9);
});

test('loadTimeline fetches, validates and normalizes', async () => {
  const loaded = await loadTimeline('timelines/x.json', async url => { assert.equal(url, 'timelines/x.json'); return raw; });
  assert.equal(JSON.stringify(loaded.stateAt(3.3)), JSON.stringify(tl.stateAt(3.3)));
  await assert.rejects(loadTimeline('bad.json', async () => ({ duration: -1 })), RangeError);
});
