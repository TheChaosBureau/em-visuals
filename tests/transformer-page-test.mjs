import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const html = fs.readFileSync(new URL('../delta-wye-transformer.html', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('transformer page is self-contained and project-path safe', () => {
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.doesNotMatch(html, /fonts\.googleapis|cdnjs/i);
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

test('transformer page has cross-link to the machine page', () => {
  assert.match(html, /rotating-field-machine\.html/);
});

test('embedded module script is syntactically valid JS', () => {
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, 'module script block found');
  const tmp = path.join(os.tmpdir(), 'delta-wye-transformer-extracted.mjs');
  fs.writeFileSync(tmp, m[1]);
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', tmp]));
});

test('field precompute (solve/windingSegs/fluxLoopSegs/probe grids) runs exactly once at boot', () => {
  // precompute() and buildFieldGeometry() are each called exactly once, as a
  // top-level statement (not from inside frame() or any update* function).
  assert.match(html, /^precompute\(\);$/m);
  assert.match(html, /^buildFieldGeometry\(\);$/m);
  const callSites = html.match(/\bprecompute\(\)/g) || [];
  assert.equal(callSites.length, 2, 'precompute() should appear once in its definition, once as the boot call');
  // solve( only appears inside precompute() and inside transformer-model.js's
  // own export — never inside frame() or the per-frame update* functions, so
  // the load/time sliders never trigger a re-solve.
  const frameStart = html.indexOf('function frame(now)');
  const frameEnd = html.indexOf('\n}', frameStart);
  const frameBody = html.slice(frameStart, frameEnd);
  assert.doesNotMatch(frameBody, /\bsolve\(/);
  for (const fn of ['updateFlux', 'updateBArrows', 'updateEArrows']) {
    const s = html.indexOf(`function ${fn}(`);
    const e = html.indexOf('\n}', s);
    assert.doesNotMatch(html.slice(s, e), /\bsolve\(/, `${fn} must not call solve()`);
    assert.doesNotMatch(html.slice(s, e), /windingSegs\(|fluxLoopSegs\(/, `${fn} must not recompute segments`);
  }
});

test('Bref/Eref are fixed constants set once inside precompute(), never rescaled per-frame', () => {
  assert.match(html, /Bref = bm \|\| 1;/);
  assert.match(html, /Eref = em \|\| 1;/);
  const assignBref = html.match(/\bBref\s*=(?!=)/g) || [];
  const assignEref = html.match(/\bEref\s*=(?!=)/g) || [];
  // one `let ... Bref = 1` initializer, one real assignment inside precompute()
  assert.equal(assignBref.length, 2, 'Bref assigned only at declaration and inside precompute()');
  assert.equal(assignEref.length, 2, 'Eref assigned only at declaration and inside precompute()');
});

test('E blend applies the load scale to the winding part only, and uses the s*c - c*s sign', () => {
  // The classic bug is swapping this sign, or letting `load` multiply Acc/Acs.
  assert.match(html, /const cx = load\*EP\.awc\[i\*3\]\s+\+ EP\.acc\[i\*3\],\s+sx = load\*EP\.aws\[i\*3\]\s+\+ EP\.acs\[i\*3\];/);
  assert.match(html, /const ex = s\*cx - c\*sx, ey = s\*cy - c\*sy, ez = s\*cz - c\*sz;/);
});

test('B blend is load * (c*Bc + s*Bs), zero at load=0', () => {
  assert.match(html, /const bx = load\*\(c\*BP\.bc\[i\*3\]\s+\+ s\*BP\.bs\[i\*3\]\);/);
});

test('hidden field layers skip their per-frame update work', () => {
  const frameStart = html.indexOf('function frame(now)');
  const frameEnd = html.indexOf('\n}', frameStart);
  const frameBody = html.slice(frameStart, frameEnd);
  assert.match(frameBody, /if \(S\.showPhi\) updateFlux\(c, s\);/);
  assert.match(frameBody, /if \(S\.showLeakB\) updateBArrows\(c, s, S\.load\);/);
  assert.match(frameBody, /if \(S\.showE\) updateEArrows\(c, s, S\.load\);/);
  assert.match(frameBody, /gFlux\.visible = S\.showPhi;/);
  assert.match(frameBody, /gBArrows\.visible = S\.showLeakB;/);
  assert.match(frameBody, /gEArrows\.visible = S\.showE;/);
});

test('field-layer geometry buffers are preallocated once, sized to the precomputed probe/span counts', () => {
  const buildStart = html.indexOf('function buildFieldGeometry()');
  const buildEnd = html.indexOf('\nprecompute();', buildStart);
  const buildBody = html.slice(buildStart, buildEnd);
  assert.match(buildBody, /new Float32Array\(nFluxVerts \* 3\)/);
  assert.match(buildBody, /new Float32Array\(BP\.n \* 6 \* 3\)/);
  assert.match(buildBody, /new Float32Array\(EP\.n \* 6 \* 3\)/);
  assert.match(html, /gFlux\.geometry\.setDrawRange\(0, vi\);/);
  assert.match(html, /gBArrows\.geometry\.setDrawRange\(0, vi\);/);
  assert.match(html, /gEArrows\.geometry\.setDrawRange\(0, vi\);/);
});

test('flux ramp is cloned intact (FLUX_RAMP stops + ramp() clamp-and-interpolate)', () => {
  assert.match(html, /const FLUX_RAMP = \[\[0\.00,0x2e,0x2a,0x6b\],\[0\.34,0x1f,0x6e,0x8c\],\[0\.62,0x33,0xcf,0xc0\],\[0\.85,0xa8,0xe8,0xf0\],\[1\.00,0xdc,0xf3,0xff\]\];/);
  assert.match(html, /function ramp\(u\) \{/);
});

test('field-render and load controls are wired to the per-frame blend, not just to S', () => {
  assert.match(html, /bindBox\('cF', 'showPhi'\); bindBox\('cB', 'showLeakB'\); bindBox\('cE', 'showE'\);/);
  assert.match(html, /S\.load = \+sL\.value \/ 100;/);
  assert.doesNotMatch(html, /requestAnimationFrame\(/);
});
