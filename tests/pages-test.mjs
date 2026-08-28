import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../rotating-field-machine.html', import.meta.url), 'utf8');

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

test('vendored runtime and license are present', () => {
  for (const path of ['vendor/three.module.js', 'vendor/three.core.js', 'vendor/VRButton.js', 'vendor/THREE-LICENSE.txt']) {
    assert.ok(fs.statSync(new URL(`../${path}`, import.meta.url)).size > 0, path);
  }
});
