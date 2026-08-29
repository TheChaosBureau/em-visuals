import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../overhead-line-power-flow.html',import.meta.url),'utf8');
const redirect=fs.readFileSync(new URL('../overhead-line-inductance.html',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');

test('power-flow page is self-contained and deployable',()=>{
  assert.doesNotMatch(html,/(?:src|href)=["']https?:/i);
  assert.match(html,/\.\/vendor\/three\.module\.js/);
  assert.match(html,/\.\/overhead-line-model\.js/);
  assert.match(workflow,/cp overhead-line-power-flow\.html _site\/overhead-line-power-flow\.html/);
  assert.match(workflow,/cp overhead-line-model\.js _site\/overhead-line-model\.js/);
  assert.match(workflow,/__BUILD_TIME__.*overhead-line-power-flow\.html/);
  assert.match(redirect,/location\.replace\('\.\/overhead-line-power-flow\.html'/);
});

test('page exposes the four-quadrant power-flow model',()=>{
  for(const id of ['voltage','current','phi','angle','speed','spacing','radius','sag','showE','showH','showS','showTriad','viScope','pqScope']) assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(html,/min="-180" max="180"/);
  assert.match(html,/S = E × H/);
  assert.match(html,/integratePoynting/);
  assert.match(html,/converter → grid/);
  assert.doesNotMatch(html,/id="length"|id="L"|GMR/);
});

test('embedded power-flow module is syntactically valid JavaScript',()=>{
  const scripts=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Function(scripts[0][1].replace(/^import .*;$/mg,'')));
});
