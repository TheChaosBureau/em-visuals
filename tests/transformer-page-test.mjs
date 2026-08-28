import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../delta-wye-transformer.html', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('transformer page is self-contained and project-path safe', () => {
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
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
