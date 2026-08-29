// Exact finite-segment Biot-Savart and vector-potential kernels.
// Units: mu0*I*N/(4*pi) = 1.
// Verified by verify_fields.js.

export function fieldB(px, py, pz, SEG) {
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0;
  for (let s = 0; s < SEG.length; s += 8) {
    const ax = SEG[s]-px, ay = SEG[s+1]-py, az = SEG[s+2]-pz;
    const bx = SEG[s+3]-px, by = SEG[s+4]-py, bz = SEG[s+5]-pz;
    const na = Math.sqrt(ax*ax+ay*ay+az*az), nb = Math.sqrt(bx*bx+by*by+bz*bz);
    const nn = na*nb, den = nn * (nn + ax*bx+ay*by+az*bz);
    if (!(den > 1e-12)) continue;
    const f = (na+nb)/den;
    const cx = ay*bz-az*by, cy = az*bx-ax*bz, cz = ax*by-ay*bx;
    const wc = SEG[s+6], ws = SEG[s+7];
    b0 += wc*f*cx; b1 += wc*f*cy; b2 += wc*f*cz;
    b3 += ws*f*cx; b4 += ws*f*cy; b5 += ws*f*cz;
  }
  const result = new Float64Array(6);
  result[0]=b0;result[1]=b1;result[2]=b2;result[3]=b3;result[4]=b4;result[5]=b5;
  return result;
}

export function fieldA(px, py, pz, SEG) {
  let a0=0,a1=0,a2=0,a3=0,a4=0,a5=0;
  for (let s = 0; s < SEG.length; s += 8) {
    const ax = SEG[s]-px, ay = SEG[s+1]-py, az = SEG[s+2]-pz;
    const bx = SEG[s+3]-px, by = SEG[s+4]-py, bz = SEG[s+5]-pz;
    let lx = bx-ax, ly = by-ay, lz = bz-az;
    const Lm = Math.sqrt(lx*lx+ly*ly+lz*lz);
    if (!(Lm > 1e-10)) continue;
    lx/=Lm; ly/=Lm; lz/=Lm;
    const na = Math.sqrt(ax*ax+ay*ay+az*az), nb = Math.sqrt(bx*bx+by*by+bz*bz);
    const t = Math.log((nb + bx*lx+by*ly+bz*lz + 1e-12) / (na + ax*lx+ay*ly+az*lz + 1e-12));
    const wc = SEG[s+6], ws = SEG[s+7];
    a0 += wc*lx*t; a1 += wc*ly*t; a2 += wc*lz*t;
    a3 += ws*lx*t; a4 += ws*ly*t; a5 += ws*lz*t;
  }
  const result = new Float64Array(6);
  result[0]=a0;result[1]=a1;result[2]=a2;result[3]=a3;result[4]=a4;result[5]=a5;
  return result;
}
