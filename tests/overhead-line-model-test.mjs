import test from 'node:test';
import assert from 'node:assert/strict';
import {balancedState,conductorCharges,integratePoynting,potentialMatrix,sampleFields,solve3} from '../overhead-line-model.js';

const positions=[{y:17,z:-6},{y:17,z:0},{y:17,z:6}],radius=.015;
const close=(actual,expected,tol,message)=>assert.ok(Math.abs(actual-expected)<=tol,`${message}: ${actual} vs ${expected}`);

test('balanced state spans the full P-Q circle with constant instantaneous total power',()=>{
  const apparent=Math.sqrt(3)*230e3*1e3;
  for(const deg of [0,60,90,120,180,-60,-120])for(const theta of [0,.37,1.8,4.2]){
    const s=balancedState(230e3,1e3,theta,deg*Math.PI/180);
    close(s.voltages.reduce((a,b)=>a+b,0),0,1e-9,'balanced voltage sum');
    close(s.currents.reduce((a,b)=>a+b,0),0,1e-11,'balanced current sum');
    close(s.totalInstantaneous,s.real,1e-6*apparent,'instantaneous power');
    close(Math.hypot(s.real,s.reactive),apparent,1e-6*apparent,'P-Q circle');
  }
});

test('potential coefficients are symmetric and charge solve recovers conductor voltages',()=>{
  const P=potentialMatrix(positions,radius),v=[120e3,-40e3,-80e3],q=conductorCharges(positions,radius,v);
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)close(P[i][j],P[j][i],1e-8,'matrix symmetry');
  const recovered=P.map(row=>row.reduce((sum,x,j)=>sum+x*q[j],0));
  recovered.forEach((x,i)=>close(x,v[i],1e-7,'recovered voltage'));
  assert.deepEqual(solve3([[3,1,0],[1,4,1],[0,1,3]],[4,6,4]).map(x=>+x.toFixed(9)),[1,1,1]);
});

test('image construction satisfies ideal-ground field boundaries',()=>{
  const f=sampleFields(0,2.3,positions,[1e-6,-.4e-6,-.6e-6],[100,-30,-70]);
  close(f.ez,0,1e-12,'tangential E');
  close(f.hy,0,1e-12,'normal H');
});

test('integrated Poynting power agrees with circuit power and reverses direction',()=>{
  for(const deg of [0,60,90,120,180,-60]){
    const s=balancedState(230e3,1e3,.37,deg*Math.PI/180);
    const q=conductorCharges(positions,radius,s.voltages);
    const result=integratePoynting({positions,radius,charges:q,currents:s.currents,yMax:120,zMax:120});
    const tolerance=Math.abs(s.real)<1?apparentTolerance(s.apparent,.01):Math.abs(s.apparent)*.02;
    close(result.power,s.real,tolerance,`field power at ${deg} degrees`);
  }
});

test('Poynting integration remains accurate at the tightest permitted geometry',()=>{
  const tight=[{y:10,z:-2},{y:10,z:0},{y:10,z:2}],s=balancedState(765e3,3e3,.2,0);
  const q=conductorCharges(tight,.005,s.voltages);
  const result=integratePoynting({positions:tight,radius:.005,charges:q,currents:s.currents,yMax:120,zMax:120});
  close(result.power,s.real,s.apparent*.02,'tight-geometry field power');
});

function apparentTolerance(apparent,fraction){return apparent*fraction}
