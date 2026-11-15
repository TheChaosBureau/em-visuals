import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAFE, safeArea, stageLayout, fillTemplate, parseMarkup, parseEquation, equationText, equationRuns, convexHull, layoutLabels
} from '../overlay.js';

const PRESETS = { wide: [1920, 1080], vertical: [1080, 1920] };
const inside = (inner, outer) => inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
const kinds = src => parseEquation(src).map(t => `${t.kind}:${t.text}${t.level ? (t.level < 0 ? '↓' : '↑') : ''}`);

test('safe area: 5 % from every edge; vertical also clears top 12 % and bottom 20 %', () => {
  assert.deepEqual(SAFE, { edge: 0.05, verticalTop: 0.12, verticalBottom: 0.20 });
  assert.deepEqual(safeArea(1920, 1080), { preset: 'wide', left: 96, right: 1824, top: 54, bottom: 1026 });
  const v = safeArea(1080, 1920);
  assert.equal(v.preset, 'vertical');
  assert.equal(v.left, 54); assert.equal(v.right, 1026);
  assert.ok(Math.abs(v.top - 230.4) < 1e-9); assert.equal(v.bottom, 1536);
});

test('equation, stage and caption bands tile the safe area in both presets', () => {
  for (const [name, [w, h]] of Object.entries(PRESETS)) {
    const L = stageLayout(w, h);
    for (const band of [L.equation, L.stage, L.caption]) assert.ok(inside(band, L.safe), `${name} band inside safe area`);
    assert.equal(L.equation.top, L.safe.top);
    assert.equal(L.equation.bottom, L.stage.top);
    assert.equal(L.stage.bottom, L.caption.top);
    assert.equal(L.caption.bottom, L.safe.bottom);
    assert.ok(L.caption.top > h * 0.6, `${name} caption sits in the lower third of the safe area`);
    assert.ok(L.centre[1] > L.stage.top && L.centre[1] < L.stage.bottom);
    assert.equal(L.unit, 10.8);
  }
});

test('templates and caption markup', () => {
  assert.equal(fillTemplate('{potential} × {flow} = {power}', { potential: '12 V', flow: '2 A', power: '24 W' }), '12 V × 2 A = 24 W');
  assert.equal(fillTemplate('{missing}!'), '!');
  assert.equal(fillTemplate(undefined), '');
  assert.deepEqual(parseMarkup('[Potential](potential) times [flow](flow) is power.'), [
    { text: 'Potential', key: 'potential' }, { text: ' times ', key: null }, { text: 'flow', key: 'flow' }, { text: ' is power.', key: null }
  ]);
  assert.deepEqual(parseMarkup('plain'), [{ text: 'plain', key: null }]);
});

test('equation formatter: variables, operators, integrals, differentials', () => {
  assert.deepEqual(kinds('p = v × i'), ['var:p', 'rel:=', 'var:v', 'bin:×', 'var:i']);
  assert.deepEqual(kinds('p = v * i'), kinds('p = v × i'), 'an asterisk becomes a multiplication sign');
  assert.deepEqual(kinds('E = ∫ p dt'), ['var:E', 'rel:=', 'int:∫', 'var:p', 'diff:d', 'var:t']);
  assert.deepEqual(kinds('E = -3'), ['var:E', 'rel:=', 'unary:−', 'num:3'], 'a hyphen becomes a minus sign');
  assert.deepEqual(kinds('a - b'), ['var:a', 'bin:−', 'var:b']);
  assert.equal(equationText(parseEquation('E = ∫ p dt')), 'E = ∫ p dt');
  assert.equal(equationText(parseEquation('p=v×i')), 'p = v × i');
});

test('equation formatter: scripts, functions and units', () => {
  assert.deepEqual(kinds('P = V_rms I_rms cos φ'), ['var:P', 'rel:=', 'var:V', 'text:rms↓', 'var:I', 'text:rms↓', 'fn:cos', 'var:φ']);
  assert.deepEqual(kinds('x^2 + y_{n+1}'), ['var:x', 'num:2↑', 'bin:+', 'var:y', 'var:n↓', 'bin:+↓', 'num:1↓']);
  assert.deepEqual(kinds('E = 24 W × 3 s = 72 J'), ['var:E', 'rel:=', 'num:24', 'unit:W', 'bin:×', 'num:3', 'unit:s', 'rel:=', 'num:72', 'unit:J']);
  assert.deepEqual(kinds('12 V × 3 s = 36 V·s'), ['num:12', 'unit:V', 'bin:×', 'num:3', 'unit:s', 'rel:=', 'num:36', 'unit:V·s']);
  assert.deepEqual(kinds('v = V̂ cos(ωt)').slice(0, 4), ['var:v', 'rel:=', 'var:V̂', 'fn:cos']);
});

test('equation runs: italic variables, upright the rest, shifted scripts, coloured symbols', () => {
  const runs = equationRuns(parseEquation('E = ∫ p dt = 72 J'), { p: 'power', E: 'power', t: 'time' });
  const by = text => runs.find(r => r.text === text);
  assert.equal(by('E').italic, true); assert.equal(by('E').key, 'power');
  assert.equal(by('=').italic, false); assert.ok(by('=').space >= 0.25);
  assert.equal(by('∫').size, 1.5);
  assert.equal(by('d').italic, false); assert.equal(by('t').italic, true); assert.equal(by('t').space, 0);
  assert.equal(by('72').italic, false);
  assert.equal(by('J').italic, false); assert.ok(by('J').space > 0 && by('J').space < 0.25, 'thin space before a unit');
  const scripted = equationRuns(parseEquation('V_rms^2 Ω'));
  assert.ok(scripted[1].shift > 0 && scripted[1].size < 1, 'subscript sits low and small');
  assert.ok(scripted[2].shift < 0 && scripted[2].size < 1, 'superscript sits high and small');
  assert.equal(scripted[3].italic, false, 'capital Greek is upright');
  assert.equal(runs[0].space, 0);
});

test('convex hull drops interior points', () => {
  const hull = convexHull([[0, 0], [4, 0], [4, 3], [0, 3], [2, 1], [1, 2], [4, 0]]);
  assert.equal(hull.length, 4);
  for (const corner of [[0, 0], [4, 0], [4, 3], [0, 3]]) assert.ok(hull.some(p => p[0] === corner[0] && p[1] === corner[1]));
});

test('labels are placed off the geometry, inside the bounds, and off each other', () => {
  for (const [name, [w, h]] of Object.entries(PRESETS)) {
    const L = stageLayout(w, h), [cx, cy] = L.centre;
    const hull = convexHull([[cx - 250, cy - 60], [cx - 40, cy - 200], [cx + 260, cy - 120], [cx + 250, cy + 90], [cx + 30, cy + 210], [cx - 250, cy + 150]]);
    const items = [
      { anchor: [cx - 250, cy + 40], dir: null, size: [150, 70] },          // left edge
      { anchor: [cx - 110, cy + 180], dir: null, size: [120, 70] },         // lower-left edge
      { anchor: [cx + 140, cy + 150], dir: null, size: [110, 70] },         // lower-right edge
      { anchor: [cx + 20, cy - 60], dir: [0, -1], size: [190, 96] },        // face, sent upward
      { anchor: [cx + 40, cy - 40], dir: [0, -1], size: [190, 96] }         // a second one the same way
    ];
    const boxes = layoutLabels(items, { hull, bounds: L.stage, gap: 16 });
    const xs = hull.map(p => p[0]), ys = hull.map(p => p[1]);
    boxes.forEach((b, i) => {
      assert.ok(b.x >= L.stage.left && b.x + b.w <= L.stage.right && b.y >= L.stage.top && b.y + b.h <= L.stage.bottom, `${name} label ${i} inside the stage`);
      assert.ok(b.x >= L.safe.left && b.x + b.w <= L.safe.right && b.y >= L.safe.top && b.y + b.h <= L.safe.bottom, `${name} label ${i} inside the safe area`);
      // no hull vertex inside the box, and the box is not swallowed by the hull
      for (const p of hull) assert.ok(!(p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h), `${name} label ${i} covers a corner`);
      const outside = b.x + b.w <= Math.min(...xs) || b.x >= Math.max(...xs) || b.y + b.h <= Math.min(...ys) || b.y >= Math.max(...ys);
      if (i === 0 || i >= 3) assert.ok(outside, `${name} label ${i} clear of the outline`);
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${name} labels ${i} and ${j} overlap`);
    }
    assert.equal(boxes[0].align, 'right', 'a label to the left of the geometry is set flush right');
    assert.equal(boxes[3].align, 'center');
    assert.ok(boxes[3].leader, 'a label pushed away from its anchor gets a leader line');
    assert.equal(boxes[0].leader, null, 'a label right beside its anchor needs none');
  }
});

test('label layout is a pure function of its inputs', () => {
  const args = [[{ anchor: [300, 300], dir: [1, 0.2], size: [100, 50] }, { anchor: [310, 300], dir: [1, 0.2], size: [100, 50] }], { hull: [[100, 100], [320, 100], [320, 400], [100, 400]], bounds: { left: 0, top: 0, right: 800, bottom: 600 }, gap: 10 }];
  const first = JSON.stringify(layoutLabels(...args));
  for (let i = 0; i < 3; i++) assert.equal(JSON.stringify(layoutLabels(...args)), first);
});
