import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeadzone, nextScale, pressedEdge } from '../xr-controls.js';

test('controller deadzone suppresses drift', () => {
  assert.equal(applyDeadzone(0.15), 0);
  assert.equal(applyDeadzone(-0.16), 0);
  assert.equal(applyDeadzone(0.2), 0.2);
});

test('scale is bounded and responds in both directions', () => {
  assert.ok(nextScale(1, -1, 1) > 1);
  assert.ok(nextScale(1, 1, 1) < 1);
  assert.equal(nextScale(2, -1, 10), 2);
  assert.equal(nextScale(0.5, 1, 10), 0.5);
});

test('buttons fire only on the pressed edge', () => {
  assert.equal(pressedEdge(true, false), true);
  assert.equal(pressedEdge(true, true), false);
  assert.equal(pressedEdge(false, true), false);
});
