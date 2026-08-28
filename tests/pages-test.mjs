import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../rotating-field-machine.html', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('page is self-contained and project-path safe', () => {
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.doesNotMatch(html, /fonts\.googleapis|cdnjs/i);
  assert.match(html, /\.\/vendor\/three\.module\.js/);
  assert.match(html, /\.\/vendor\/VRButton\.js/);
  assert.match(html, /\.\/xr-controls\.js/);
});

test('renderer uses the WebXR-owned animation loop', () => {
  assert.match(html, /renderer\.xr\.enabled\s*=\s*true/);
  assert.match(html, /renderer\.setAnimationLoop\(frame\)/);
  assert.doesNotMatch(html, /requestAnimationFrame\(/);
});

test('WebXR controllers can grab independently rooted motors', () => {
  assert.match(html, /renderer\.xr\.getController\(i\)/);
  assert.match(html, /addEventListener\('selectstart'/);
  assert.match(html, /addEventListener\('selectend'/);
  assert.match(html, /controller\.attach\(root\)/);
  assert.match(html, /gMachines\.attach\(state\.root\)/);
  assert.match(html, /motorRoot\.userData\.machineIndex/);
  assert.match(html, /machinePoses\[state\.motorIndex\]\.position\.copy/);
  assert.match(html, /scheduleFieldRecompute\(\)/);
  assert.match(html, /posedPoint\(M, machineIndex/);
});

test('motors default to a horizontal orientation on desktop and in WebXR', () => {
  assert.match(html, /const HORIZONTAL_ORIENTATION = Math\.PI \/ 2/);
  assert.match(html, /xrPlacement\.add\(modelRoot\);[\s\S]*?modelRoot\.rotation\.set\(0, HORIZONTAL_ORIENTATION, 0\)/);
  const resetStart = html.indexOf('function resetXRPlacement');
  const resetEnd = html.indexOf('function setPlaying', resetStart);
  const reset = html.slice(resetStart, resetEnd);
  assert.match(reset, /modelRoot\.rotation\.set\(0, HORIZONTAL_ORIENTATION, 0\)/);
  assert.doesNotMatch(reset, /modelRoot\.rotation\.set\(-Math\.PI \/ 2, 0, 0\)/);
  const sessionEnd = html.match(/renderer\.xr\.addEventListener\('sessionend', \(\) => \{([\s\S]*?)\n\}\);/)?.[1] ?? '';
  assert.match(sessionEnd, /modelRoot\.rotation\.set\(0, HORIZONTAL_ORIENTATION, 0\)/);
});

test('published page identifies its commit and deployment time', () => {
  assert.match(html, /build <code>__BUILD_HASH__<\/code> · published/);
  assert.match(html, /<time datetime="__BUILD_TIME__">__BUILD_TIME__<\/time>/);
  assert.match(workflow, /git rev-parse --short=7 HEAD/);
  assert.match(workflow, /date -u \+'%Y-%m-%dT%H:%M:%SZ'/);
  assert.match(workflow, /sed -i .*__BUILD_HASH__.*__BUILD_TIME__.*_site\/index\.html/);
});

test('vendored runtime and license are present', () => {
  for (const path of ['vendor/three.module.js', 'vendor/three.core.js', 'vendor/VRButton.js', 'vendor/THREE-LICENSE.txt']) {
    assert.ok(fs.statSync(new URL(`../${path}`, import.meta.url)).size > 0, path);
  }
});
