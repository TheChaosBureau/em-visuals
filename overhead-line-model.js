export const EPS0=8.8541878128e-12;
export const MU0=1.25663706212e-6;

const TAU=Math.PI*2;
const PHASE_OFFSETS=[0,-TAU/3,TAU/3];

export function balancedState(vllRms,irms,theta,phi){
  const vp=Math.sqrt(2/3)*vllRms,ip=Math.SQRT2*irms;
  const voltages=PHASE_OFFSETS.map(a=>vp*Math.cos(theta+a));
  const currents=PHASE_OFFSETS.map(a=>ip*Math.cos(theta+a-phi));
  const apparent=Math.sqrt(3)*vllRms*irms;
  const real=apparent*Math.cos(phi),reactive=apparent*Math.sin(phi);
  const phasePowers=voltages.map((v,k)=>v*currents[k]);
  return{voltages,currents,phasePowers,totalInstantaneous:phasePowers.reduce((a,b)=>a+b,0),apparent,real,reactive,powerFactor:Math.cos(phi)};
}

export function potentialMatrix(positions,radius){
  const n=positions.length,P=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
    const a=positions[i],b=positions[j];
    if(i===j)P[i][j]=Math.log(2*a.y/radius)/(TAU*EPS0);
    else{
      const dz=a.z-b.z,dy=a.y-b.y,dyImage=a.y+b.y;
      P[i][j]=Math.log(Math.hypot(dyImage,dz)/Math.hypot(dy,dz))/(TAU*EPS0);
    }
  }
  return P;
}

export function solve3(matrix,values){
  const a=matrix.map((row,i)=>[...row,values[i]]);
  for(let c=0;c<3;c++){
    let pivot=c;for(let r=c+1;r<3;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
    if(Math.abs(a[pivot][c])<1e-20)throw new Error('Singular conductor potential matrix');
    [a[c],a[pivot]]=[a[pivot],a[c]];
    const d=a[c][c];for(let k=c;k<4;k++)a[c][k]/=d;
    for(let r=0;r<3;r++)if(r!==c){const f=a[r][c];for(let k=c;k<4;k++)a[r][k]-=f*a[c][k]}
  }
  return a.map(row=>row[3]);
}

export function conductorCharges(positions,radius,voltages){
  return solve3(potentialMatrix(positions,radius),voltages);
}

export function sampleFields(y,z,positions,charges,currents,radius=0){
  let ey=0,ez=0,hy=0,hz=0,inside=false;
  for(let k=0;k<positions.length;k++){
    const p=positions[k],dy=y-p.y,dz=z-p.z,r2=dy*dy+dz*dz;
    if(radius&&r2<=radius*radius)inside=true;
    const ri2=Math.max(r2,1e-20),dyi=y+p.y,rii2=Math.max(dyi*dyi+dz*dz,1e-20);
    const ef=charges[k]/(TAU*EPS0),hf=currents[k]/TAU;
    ey+=ef*(dy/ri2-dyi/rii2);ez+=ef*(dz/ri2-dz/rii2);
    hy+=hf*(-dz/ri2+dz/rii2);hz+=hf*(dy/ri2-dyi/rii2);
  }
  return{ey,ez,hy,hz,sx:ey*hz-ez*hy,inside};
}

export function integratePoynting({positions,radius,charges,currents,yMax,zMax,ny=320,nz=480,nr=72,nt=120}){
  let separation=Infinity;
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)separation=Math.min(separation,Math.hypot(positions[i].y-positions[j].y,positions[i].z-positions[j].z));
  const nearRadius=Math.min(separation*.4,...positions.map(p=>p.y*.4));
  const dy=yMax/ny,dz=2*zMax/nz;let power=0,samples=0,skipped=0;
  for(let iy=0;iy<ny;iy++){
    const y=(iy+.5)*dy;
    for(let iz=0;iz<nz;iz++){
      const z=-zMax+(iz+.5)*dz;
      if(positions.some(p=>Math.hypot(y-p.y,z-p.z)<nearRadius)){skipped++;continue}
      power+=sampleFields(y,z,positions,charges,currents).sx*dy*dz;samples++;
    }
  }
  const dl=Math.log(nearRadius/radius)/nr,da=TAU/nt;
  for(const p of positions)for(let ir=0;ir<nr;ir++){
    const r=radius*Math.exp((ir+.5)*dl),area=r*r*dl*da;
    for(let it=0;it<nt;it++){
      const a=(it+.5)*da,y=p.y+r*Math.cos(a),z=p.z+r*Math.sin(a);
      if(y<=0)continue;
      power+=sampleFields(y,z,positions,charges,currents).sx*area;samples++;
    }
  }
  return{power,samples,skipped,yMax,zMax,ny,nz,nr,nt,nearRadius};
}
