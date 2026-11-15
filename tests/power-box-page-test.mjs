import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTimeline } from '../timeline.js';
import { DEFAULTS, faces } from '../power-box-model.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('power-box.html');
const workflow = read('.github/workflows/pages.yml');
const timelines = ['power-box-steady.json', 'power-box-sine.json'].map(file => [file, createTimeline(JSON.parse(read(`timelines/${file}`)))]);

test('power-box page is self-contained and project-path safe', () => {
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.doesNotMatch(html, /fonts\.googleapis|cdnjs/i);
  for (const file of ['vendor/three.module.js', 'vendor/VRButton.js', 'xr-controls.js', 'scene-clock.js', 'timeline.js', 'overlay.js', 'power-box-model.js']) {
    assert.ok(html.includes(`./${file}`), `imports ./${file}`);
  }
});

test('power-box page is deployed with its modules and timelines', () => {
  for (const file of ['power-box.html', 'power-box-model.js', 'scene-clock.js', 'timeline.js', 'overlay.js']) {
    assert.ok(workflow.includes(`cp ${file} _site/${file}`), `workflow copies ${file}`);
  }
  assert.match(workflow, /cp -R timelines _site\/timelines/);
  assert.match(workflow, /sed -i .*__BUILD_HASH__.*__BUILD_TIME__.*_site\/power-box\.html/);
  assert.match(html, /build <code>__BUILD_HASH__<\/code> · published/);
  assert.match(html, /<time datetime="__BUILD_TIME__">__BUILD_TIME__<\/time>/);
});

test('embedded module script is syntactically valid JS', () => {
  const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const tmp = path.join(os.tmpdir(), 'power-box-extracted.mjs');
  fs.writeFileSync(tmp, scripts[0][1]);
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', tmp]));
});

test('all animation reads time from the scene clock', () => {
  assert.match(html, /const clock = createSceneClock\(\);/);
  assert.match(html, /const dt = clock\.tick\(now\);/);
  assert.match(html, /clock\.drawn\(\);/);
  assert.match(html, /timeline\.stateAt\(/);
  assert.doesNotMatch(html, /performance\.now|Date\.now|setTimeout|setInterval/);
  assert.match(html, /renderer\.xr\.enabled\s*=\s*true/);
  assert.match(html, /renderer\.setAnimationLoop\(frame\)/);
  assert.doesNotMatch(html, /requestAnimationFrame\(/);
});

test('panel exposes potential, flow, duration, mode, phase and the playhead', () => {
  for (const id of ['sV', 'sI', 'sD', 'sP', 'sF', 'sT', 'modes', 'bPlay', 'bView', 'cL', 'cF', 'cG', 'overlay']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="sV" min="0" max="24" step="0\.5" value="12"/);
  assert.match(html, /id="sI" min="0" max="4" step="0\.1" value="2"/);
  assert.match(html, /id="sD" min="1" max="6" step="0\.5" value="3"/);
  assert.match(html, /id="sP" min="0" max="180" step="1" value="0"/);
  assert.match(html, /data-m="0"[^>]*>Steady/);
  assert.match(html, /data-m="1"[^>]*>Sinusoidal/);
});

test('the worked numbers on the page are the model\'s', () => {
  const f = faces(DEFAULTS);
  assert.deepEqual([DEFAULTS.potential, DEFAULTS.flow, DEFAULTS.duration, f.power, f.charge, f.voltSeconds, f.energy], [12, 2, 3, 24, 6, 36, 72]);
  for (const [id, text] of [['rV', '12 V'], ['rI', '2 A'], ['rP', '24 W'], ['rQ', '6 C'], ['rL', '36 V·s'], ['rE', '72 J']]) {
    assert.ok(html.includes(`id="${id}">${text}<`), `${id} starts at ${text}`);
  }
  assert.match(html, /potential: DEFAULTS\.potential, flow: DEFAULTS\.flow, duration: DEFAULTS\.duration/);
});

test('WebXR follows the xr-controls conventions and falls back to sprite labels', () => {
  assert.match(html, /import \{ applyDeadzone, nextScale, pressedEdge \} from '\.\/xr-controls\.js';/);
  assert.match(html, /xrScale = nextScale\(xrScale, y, dt\);/);
  assert.match(html, /xrPlacement\.rotation\.y -= x \* dt \* 1\.5;/);
  assert.match(html, /sprites: presenting \|\| forceSprites/);
  assert.match(html, /createOverlay\(\{[\s\S]*?THREE, spriteParent: modelRoot/);
});

test('shipped power-box timelines only use what the page provides', () => {
  for (const [file, tl] of timelines) {
    for (const name of Object.keys(tl.params)) assert.match(html, new RegExp(`\\bp\\.${name}\\b`), `${file}: the page reads parameter "${name}"`);
    for (const cue of tl.cues) {
      if (cue.type === 'label') assert.match(html, new RegExp(`\\b${cue.anchor}: \\(\\) =>`), `${file}: anchor "${cue.anchor}"`);
      for (const field of [cue.title, cue.text, cue.note]) {
        for (const [, name] of (field ?? '').matchAll(/\{([\w-]+)\}/g)) assert.match(html, new RegExp(`\\b${name}: `), `${file}: readout "{${name}}"`);
      }
      if (cue.color) assert.match(html, new RegExp(`\\b${cue.color}: '#[0-9a-f]{6}'`), `${file}: colour "${cue.color}"`);
      if (cue.type === 'caption') for (const [, key] of cue.text.matchAll(/\]\(([\w-]+)\)/g)) assert.match(html, new RegExp(`\\b${key}: '#[0-9a-f]{6}'`), `${file}: caption colour "${key}"`);
    }
  }
});

test('the steady script reveals edges, rectangle and box, then names each face', () => {
  const tl = timelines[0][1], at = t => tl.stateAt(t);
  assert.equal(at(0).params.potential, 0);
  assert.equal(at(3).params.potential, 12); assert.ok(at(3).params.flow > 0 && at(3).params.fill === 0, 'edges come first');
  assert.equal(at(5.5).params.fill, 1); assert.equal(at(5.5).params.playhead, 0, 'then the rectangle');
  assert.equal(at(9.5).params.playhead, 3, 'then the box');
  const anchors = tl.cues.filter(c => c.type === 'label').map(c => c.anchor);
  for (const name of ['potential', 'flow', 'time', 'power', 'charge', 'voltseconds']) assert.ok(anchors.includes(name), `labels ${name}`);
  const text = tl.cues.map(c => c.text).join('\n');
  for (const value of ['{power}', '{charge}', '{voltseconds}', '{energy}']) assert.ok(text.includes(value), `shows ${value}`);
  assert.deepEqual(at(20).params, { potential: 12, flow: 2, fill: 1, duration: 3, playhead: 3, mode: 0 });
});

test('the sine script morphs the steady box and sweeps the phase from 0 to 90°', () => {
  const tl = timelines[1][1], at = t => tl.stateAt(t).params;
  assert.equal(at(0).mode, 0); assert.equal(at(7).mode, 1);
  assert.equal(at(9).phase, 0); assert.equal(at(20).phase, 90);
  assert.ok(at(13).phase > 0 && at(13).phase < 90);
  assert.ok(Math.abs(at(0).frequency * at(0).duration - 2) < 1e-9, 'a whole number of cycles fits the box');
});
