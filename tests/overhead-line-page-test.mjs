import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../overhead-line-inductance.html',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');

test('overhead line page is self-contained and deployable',()=>{
  assert.doesNotMatch(html,/(?:src|href)=["']https?:/i);
  assert.match(html,/\.\/vendor\/three\.module\.js/);
  assert.match(workflow,/cp overhead-line-inductance\.html _site\/overhead-line-inductance\.html/);
  assert.match(workflow,/__BUILD_TIME__.*overhead-line-inductance\.html/);
});

test('page exposes the geometry and inductance model',()=>{
  for(const id of ['spacing','radius','sag','length','sideView','fieldView','field','slice','projection']) assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(html,/2e-7\*Math\.log\(spacing\/gmr\)/);
  assert.match(html,/\.7788\*radius/);
  assert.match(html,/function B\(x,y,z,I\)/);
  assert.match(html,/Math\.cos\(p-2\*Math\.PI\/3\)/);
  assert.match(html,/phase-2\*Math\.PI\*electricalLength\*x\/span/);
});
