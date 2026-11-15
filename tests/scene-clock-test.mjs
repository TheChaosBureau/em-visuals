import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneClock, parseClockParams, DEFAULT_FPS, MAX_REAL_STEP } from '../scene-clock.js';

test('URL parameters select fixed-step mode and the frame', () => {
  assert.deepEqual(parseClockParams(''), { fixed: false, fps: DEFAULT_FPS, frame: 0, timeline: null });
  assert.deepEqual(parseClockParams('?fps=30&frame=120'), { fixed: true, fps: 30, frame: 120, timeline: null });
  assert.deepEqual(parseClockParams('?frame=7&timeline=timelines/a.json'), { fixed: true, fps: DEFAULT_FPS, frame: 7, timeline: 'timelines/a.json' });
  assert.equal(parseClockParams('?fps=0').fixed, false);
  assert.equal(parseClockParams('?fps=abc&frame=-3').fixed, false);
  assert.equal(parseClockParams('?frame=1.5').fixed, false);
});

test('real time is the default and steps exactly as the page loops did', () => {
  let wall = 1000;
  const host = {}, clock = createSceneClock({ search: '', now: () => wall, host });
  assert.equal(clock.fixed, false);
  assert.equal(clock.tick(1016), (1016 - 1000) / 1000);
  assert.equal(clock.tick(1516), MAX_REAL_STEP);            // a stall is clamped to 50 ms
  assert.ok(Math.abs(clock.time - (0.016 + MAX_REAL_STEP)) < 1e-12);
  clock.drawn(); clock.tick(1532);
  assert.equal('__frameReady' in host, false);
  assert.equal(clock.settled, false);
  assert.equal('__setFrame' in host, false);
});

test('fixed step: time is frame / fps whatever the wall clock says', () => {
  let wall = 0;
  const host = {}, clock = createSceneClock({ search: '?fps=30&frame=120', now: () => wall, host });
  assert.equal(clock.fixed, true);
  assert.equal(clock.time, 4);
  wall = 987654;
  assert.equal(clock.tick(wall), 0);
  assert.equal(clock.time, 4);
  assert.equal(clock.frame, 120);
});

test('fixed step: __frameReady is raised only after the frame has been drawn', async () => {
  const host = {}, clock = createSceneClock({ search: '?fps=25&frame=3', now: () => 0, host });
  const loop = (draw = true) => { clock.tick(); if (draw && !clock.settled) clock.drawn(); };
  assert.equal(host.__frameReady, false);
  clock.tick();
  assert.equal(host.__frameReady, false, 'not before the page has drawn');
  clock.drawn();
  assert.equal(host.__frameReady, false, 'not until the loop comes round again');
  assert.equal(clock.settled, false);
  clock.tick();
  assert.equal(host.__frameReady, true);
  assert.equal(clock.settled, true);

  let resolved = null;
  const pending = host.__setFrame(50).then(n => { resolved = n; });
  assert.equal(host.__frameReady, false);
  assert.equal(clock.settled, false);
  assert.equal(clock.time, 2);
  loop();
  await Promise.resolve();
  assert.equal(resolved, null);
  loop();
  await pending;
  assert.equal(resolved, 50);
  assert.equal(host.__frameReady, true);
  await assert.rejects(clock.setFrame(-1), RangeError);
  await assert.rejects(clock.setFrame(2.5), RangeError);
});

test('fixed step: invalidate asks for the same frame to be drawn again', () => {
  const host = {}, clock = createSceneClock({ search: '?frame=9', now: () => 0, host });
  clock.tick(); clock.drawn(); clock.tick();
  assert.equal(clock.settled, true);
  clock.invalidate();
  assert.equal(clock.settled, false);
  assert.equal(host.__frameReady, false);
  assert.equal(clock.frame, 9);
  clock.tick(); clock.drawn(); clock.tick();
  assert.equal(host.__frameReady, true);
  const real = createSceneClock({ search: '', now: () => 0, host: {} });
  real.drawn(); real.invalidate(); real.tick(16);
  assert.equal(real.settled, false, 'real time never settles');
});

test('frames can be selected in any order', () => {
  const clock = createSceneClock({ search: '?fps=30', now: () => 0, host: {} });
  const times = [90, 3, 600, 3, 0].map(n => { clock.setFrame(n); return clock.time; });
  assert.deepEqual(times, [3, 0.1, 20, 0.1, 0]);
});
