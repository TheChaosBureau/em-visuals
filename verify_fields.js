// Verification of the exact finite-segment Biot-Savart and vector-potential
// kernels used by the 3-D field renderer, plus Maxwell-constraint checks on
// the assembled 2-pole, 3-phase winding.
//
// Units: mu0*I*N/(4*pi) = 1, R_bore = 1.

const TAU = Math.PI * 2;
const R_BORE = 1.0, LEN = 2.4, RW = 1.06, HEND = 0.30;
const GAMMAS = [75, 105];          // concentric coil half-angles (deg) -> 12-slot, q=2
const NARC = 14;

// ---------------------------------------------------------------- geometry
function coilPath(phi, gamDeg, cx) {
  const gam = gamDeg * Math.PI / 180;
  const th1 = phi + gam, th2 = phi - gam;
  const zA = -LEN / 2, zB = LEN / 2;
  const P = [];
  P.push([cx + RW * Math.cos(th1), RW * Math.sin(th1), zA]);
  P.push([cx + RW * Math.cos(th1), RW * Math.sin(th1), zB]);
  for (let i = 1; i <= NARC; i++) {
    const s = i / NARC, th = th1 + (th2 - th1) * s;
    P.push([cx + RW * Math.cos(th), RW * Math.sin(th), zB + HEND * Math.sin(Math.PI * s)]);
  }
  P.push([cx + RW * Math.cos(th2), RW * Math.sin(th2), zA]);
  for (let i = 1; i <= NARC; i++) {
    const s = i / NARC, th = th2 + (th1 - th2) * s;
    P.push([cx + RW * Math.cos(th), RW * Math.sin(th), zA - HEND * Math.sin(Math.PI * s)]);
  }
  return P;
}

// Flat segment array, stride 8: x1 y1 z1 x2 y2 z2 wc ws
function buildSegments(machines) {
  const out = [];
  for (const M of machines) {
    for (let k = 0; k < 3; k++) {
      const phi = k * TAU / 3;
      const wc = Math.cos(k * TAU / 3) * M.sc;
      const ws = Math.sin(k * TAU / 3) * M.ss;
      for (const g of GAMMAS) {
        const P = coilPath(phi, g, M.cx);
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length];
          out.push(a[0], a[1], a[2], b[0], b[1], b[2], wc, ws);
        }
      }
    }
  }
  return Float64Array.from(out);
}

// ------------------------------------------------------------ field kernels
function fieldB(px, py, pz, SEG) {
  let bcx = 0, bcy = 0, bcz = 0, bsx = 0, bsy = 0, bsz = 0;
  for (let s = 0; s < SEG.length; s += 8) {
    const ax = SEG[s] - px, ay = SEG[s + 1] - py, az = SEG[s + 2] - pz;
    const bx = SEG[s + 3] - px, by = SEG[s + 4] - py, bz = SEG[s + 5] - pz;
    const na = Math.sqrt(ax * ax + ay * ay + az * az);
    const nb = Math.sqrt(bx * bx + by * by + bz * bz);
    const dot = ax * bx + ay * by + az * bz;
    const den = na * nb * (na * nb + dot);
    if (!(den > 1e-14)) continue;
    const f = (na + nb) / den;
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const wc = SEG[s + 6], ws = SEG[s + 7];
    bcx += wc * f * cx; bcy += wc * f * cy; bcz += wc * f * cz;
    bsx += ws * f * cx; bsy += ws * f * cy; bsz += ws * f * cz;
  }
  return [bcx, bcy, bcz, bsx, bsy, bsz];
}

function fieldA(px, py, pz, SEG) {
  let acx = 0, acy = 0, acz = 0, asx = 0, asy = 0, asz = 0;
  for (let s = 0; s < SEG.length; s += 8) {
    const ax = SEG[s] - px, ay = SEG[s + 1] - py, az = SEG[s + 2] - pz;
    const bx = SEG[s + 3] - px, by = SEG[s + 4] - py, bz = SEG[s + 5] - pz;
    let lx = bx - ax, ly = by - ay, lz = bz - az;
    const Lm = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (!(Lm > 1e-12)) continue;
    lx /= Lm; ly /= Lm; lz /= Lm;
    const na = Math.sqrt(ax * ax + ay * ay + az * az);
    const nb = Math.sqrt(bx * bx + by * by + bz * bz);
    const num = nb + (bx * lx + by * ly + bz * lz);
    const den = na + (ax * lx + ay * ly + az * lz);
    const t = Math.log((num + 1e-12) / (den + 1e-12));
    const wc = SEG[s + 6], ws = SEG[s + 7];
    acx += wc * lx * t; acy += wc * ly * t; acz += wc * lz * t;
    asx += ws * lx * t; asy += ws * ly * t; asz += ws * lz * t;
  }
  return [acx, acy, acz, asx, asy, asz];
}

const Bat = (p, SEG, t) => {
  const F = fieldB(p[0], p[1], p[2], SEG), c = Math.cos(t), s = Math.sin(t);
  return [c * F[0] + s * F[3], c * F[1] + s * F[4], c * F[2] + s * F[5]];
};
const Aat = (p, SEG, t) => {
  const F = fieldA(p[0], p[1], p[2], SEG), c = Math.cos(t), s = Math.sin(t);
  return [c * F[0] + s * F[3], c * F[1] + s * F[4], c * F[2] + s * F[5]];
};
// E = -dA/dt  with A = cos(wt) Ac + sin(wt) As, omega = 1
const Eat = (p, SEG, t) => {
  const F = fieldA(p[0], p[1], p[2], SEG), c = Math.cos(t), s = Math.sin(t);
  return [s * F[0] - c * F[3], s * F[1] - c * F[4], s * F[2] - c * F[5]];
};

// -------------------------------------------------------------- test helpers
const nrm = v => Math.hypot(v[0], v[1], v[2]);
let pass = 0, fail = 0;
function check(name, got, want, tol, extra) {
  const ok = Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name.padEnd(52)} got ${got.toExponential(4)}  want ${want.toExponential(4)}${extra ? '   ' + extra : ''}`);
}

function divergence(fn, p, h) {
  let d = 0;
  for (let i = 0; i < 3; i++) {
    const pp = p.slice(), pm = p.slice();
    pp[i] += h; pm[i] -= h;
    d += (fn(pp)[i] - fn(pm)[i]) / (2 * h);
  }
  return d;
}
function curl(fn, p, h) {
  const d = [];
  for (let i = 0; i < 3; i++) {
    const pp = p.slice(), pm = p.slice();
    pp[i] += h; pm[i] -= h;
    const a = fn(pp), b = fn(pm);
    d.push([(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h), (a[2] - b[2]) / (2 * h)]);
  }
  // d[i][j] = d F_j / d x_i
  return [d[1][2] - d[2][1], d[2][0] - d[0][2], d[0][1] - d[1][0]];
}

// ================================================================== TEST RUN
const SEG1 = buildSegments([{ cx: 0, sc: 1, ss: 1 }]);
console.log(`Winding: 3 phases x ${GAMMAS.length} concentric coils, ${SEG1.length / 8} segments\n`);

// -- 1. straight-filament kernel against the infinite-wire limit -------------
console.log('1. Kernel sanity: long straight filament vs mu0*I/(2*pi*rho)');
{
  const T = 1e3;  // |a||b| + a.b cancels badly for very long segments; 1e3 is already effectively infinite here
  const W = Float64Array.from([0, 0, -T, 0, 0, T, 1, 0]);
  for (const rho of [0.5, 2.0]) {
    const F = fieldB(rho, 0, 0, W);
    const exact = (2 / rho) * (T / Math.hypot(rho, T));   // finite segment, not infinite
    check(`|B| at rho=${rho} vs exact finite segment`, F[1], exact, 1e-9 * exact);
    check(`  transverse purity Bx,Bz at rho=${rho}`, Math.hypot(F[0], F[2]), 0, 1e-12);
  }
  const Az = r => Math.log((Math.hypot(r, T) + T) / (Math.hypot(r, T) - T + 1e-300));
  check('  A_z(rho=2) - A_z(rho=1) vs closed form',
    fieldA(2, 0, 0, W)[2] - fieldA(1, 0, 0, W)[2], Az(2) - Az(1), 1e-7);  // 1e-12 guard epsilon in the log shows up here
}

// -- 2. bore field: is it the uniform rotating transverse field? -------------
console.log('\n2. Bore field structure (the point where the source doc drops a term)');
{
  const B0 = Bat([0, 0, 0], SEG1, 0);
  check('B at bore centre is along +x at wt=0 (By)', B0[1], 0, 1e-9 * nrm(B0));
  check('  ... and axial component is zero (Bz)', B0[2], 0, 1e-9 * nrm(B0));
  const Bq = Bat([0, 0, 0], SEG1, Math.PI / 2);
  check('B at wt=90deg is along +y (Bx)', Bq[0], 0, 1e-9 * nrm(Bq));
  check('  magnitude invariant under rotation', nrm(Bq) / nrm(B0), 1, 2e-3);

  // uniformity: sample a ring at rho = 0.6 in the mid-plane
  let maxdev = 0;
  for (let i = 0; i < 24; i++) {
    const th = i * TAU / 24;
    const b = Bat([0.6 * Math.cos(th), 0.6 * Math.sin(th), 0], SEG1, 0);
    maxdev = Math.max(maxdev, Math.hypot(b[0] - B0[0], b[1] - B0[1], b[2] - B0[2]) / nrm(B0));
  }
  check('bore field uniform on rho=0.6 ring (max rel dev)', maxdev, 0, 0.09,
    '<- uniform transverse, NOT radial-only');

  // tangential component is comparable to radial -- the term the doc omits
  const th = 0.7;
  const b = Bat([0.6 * Math.cos(th), 0.6 * Math.sin(th), 0], SEG1, 0);
  const Brad = b[0] * Math.cos(th) + b[1] * Math.sin(th);
  const Btan = -b[0] * Math.sin(th) + b[1] * Math.cos(th);
  check('B_theta/B_rho at theta=0.7 (expect -tan(theta))', Btan / Brad, -Math.tan(th), 0.06,
    '<- doc sets B_theta = 0');
}

// -- 3. Maxwell constraints --------------------------------------------------
console.log('\n3. Maxwell constraints on the assembled winding');
{
  const t = 0.83;
  const f = p => Bat(p, SEG1, t);
  const pts = [[0.3, 0.2, 0.1], [0.7, -0.4, 0.5], [2.4, 1.1, -0.9], [0.1, 0.05, 1.9]];
  for (const p of pts) {
    const scale = nrm(f(p));
    check(`div B at (${p})`, divergence(f, p, 1e-3) / scale, 0, 4e-3);
  }
  for (const p of [[0.3, 0.2, 0.1], [2.4, 1.1, -0.9]]) {
    const scale = nrm(f(p));
    check(`|curl B| at (${p}) in current-free region`, nrm(curl(f, p, 1e-3)) / scale, 0, 5e-3);
  }
}

// -- 4. E = -dA/dt is consistent with Faraday --------------------------------
console.log('\n4. Faraday: curl E = -dB/dt  (omega = 1)');
{
  const t = 0.41, dt = 1e-4;
  for (const p of [[0.4, 0.25, 0.2], [0.8, -0.3, -0.6], [1.9, 0.9, 0.4]]) {
    const cE = curl(q => Eat(q, SEG1, t), p, 1e-3);
    const b1 = Bat(p, SEG1, t + dt), b0 = Bat(p, SEG1, t - dt);
    const dB = [(b1[0] - b0[0]) / (2 * dt), (b1[1] - b0[1]) / (2 * dt), (b1[2] - b0[2]) / (2 * dt)];
    const err = Math.hypot(cE[0] + dB[0], cE[1] + dB[1], cE[2] + dB[2]) / nrm(dB);
    check(`|curl E + dB/dt| / |dB/dt| at (${p})`, err, 0, 6e-3);
  }
  check('div A = 0 (Coulomb gauge, closed loops)',
    divergence(q => Aat(q, SEG1, 0.41), [0.5, 0.3, 0.2], 1e-3) / nrm(Aat([0.5, 0.3, 0.2], SEG1, 0.41)),
    0, 5e-3);
}

// -- 5. E_z in the bore: rho*cos(theta - wt) ---------------------------------
console.log('\n5. Induced E in the bore (the back-EMF driver)');
{
  const t = 0.0;
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const th = i * TAU / 8;
    const e = Eat([0.8 * Math.cos(th), 0.8 * Math.sin(th), 0], SEG1, t);
    rows.push([th, e[2], Math.hypot(e[0], e[1])]);
  }
  const amp = Math.max(...rows.map(r => Math.abs(r[1])));
  let maxerr = 0, maxtrans = 0;
  for (const [th, ez, et] of rows) {
    maxerr = Math.max(maxerr, Math.abs(ez - amp * Math.cos(th)) / amp);
    maxtrans = Math.max(maxtrans, et / amp);
  }
  check('E_z on rho=0.8 ring follows cos(theta - wt)', maxerr, 0, 0.06);
  check('  transverse E is negligible in the mid-plane', maxtrans, 0, 0.06);
  // linear in rho
  const e1 = Eat([0.4, 0, 0], SEG1, 0)[2], e2 = Eat([0.8, 0, 0], SEG1, 0)[2];
  check('  E_z scales ~linearly with rho (E(0.8)/E(0.4))', e2 / e1, 2.0, 0.12);
}

// -- 6. far field matches the point dipole ----------------------------------
console.log('\n6. Exterior field vs point dipole  m = (I/2) * closed-loop integral r x dl');
{
  // magnetic moment from the actual geometry
  const m = [0, 0, 0];
  for (let s = 0; s < SEG1.length; s += 8) {
    const rx = 0.5 * (SEG1[s] + SEG1[s + 3]), ry = 0.5 * (SEG1[s + 1] + SEG1[s + 4]), rz = 0.5 * (SEG1[s + 2] + SEG1[s + 5]);
    const dx = SEG1[s + 3] - SEG1[s], dy = SEG1[s + 4] - SEG1[s + 1], dz = SEG1[s + 5] - SEG1[s + 2];
    const w = SEG1[s + 6];              // cos-component (t = 0)
    m[0] += 0.5 * w * (ry * dz - rz * dy);
    m[1] += 0.5 * w * (rz * dx - rx * dz);
    m[2] += 0.5 * w * (rx * dy - ry * dx);
  }
  console.log(`     m(wt=0) = [${m.map(v => v.toFixed(4)).join(', ')}]   |m| = ${nrm(m).toFixed(4)}`);
  check('m is transverse (m_z)', m[2], 0, 1e-9 * nrm(m));
  check('m is along +x at wt=0 (m_y)', m[1], 0, 1e-9 * nrm(m));

  for (const D of [8, 16]) {
    for (const dir of [[1, 0, 0], [0, 0, 1], [0.6, 0.8, 0]]) {
      const p = dir.map(c => c * D);
      const b = Bat(p, SEG1, 0);
      const r3 = D * D * D, mr = (m[0] * dir[0] + m[1] * dir[1] + m[2] * dir[2]);
      const bd = [0, 1, 2].map(i => (3 * mr * dir[i] - m[i]) / r3);
      check(`D=${D} dir=[${dir}] rel err vs dipole`,
        Math.hypot(b[0] - bd[0], b[1] - bd[1], b[2] - bd[2]) / nrm(bd), 0, D === 8 ? 0.05 : 0.015);
    }
  }
}

// -- 7. two-machine interaction energy ---------------------------------------
console.log('\n7. Two-machine dipole-dipole energy U(t)  [units of (mu0/4pi) m0^2 / D^3]');
{
  const D = 4.6;
  const modes = { parallel: [1, 1], 'anti-phase': [-1, -1], 'reversed sequence': [1, -1] };
  const analytic = {
    parallel: t => -(3 * Math.cos(t) ** 2 - 1),
    'anti-phase': t => +(3 * Math.cos(t) ** 2 - 1),
    'reversed sequence': t => -(1 + Math.cos(t) ** 2),
  };
  for (const [name, [sc, ss]] of Object.entries(modes)) {
    let lo = 1e9, hi = -1e9, sum = 0, n = 0, maxerr = 0;
    for (let i = 0; i < 180; i++) {
      const t = i * TAU / 180;
      const mA = [Math.cos(t), Math.sin(t), 0];
      const mB = [sc * Math.cos(t), ss * Math.sin(t), 0];
      // B_A at machine B, separation along +x
      const BA = [2 * mA[0], -mA[1], 0].map(v => v / (D * D * D));
      const U = -(mB[0] * BA[0] + mB[1] * BA[1]) * (D * D * D); // normalised by D^3
      lo = Math.min(lo, U); hi = Math.max(hi, U); sum += U; n++;
      maxerr = Math.max(maxerr, Math.abs(U - analytic[name](t)));
    }
    console.log(`  ${name.padEnd(20)} U in [${lo.toFixed(3)}, ${hi.toFixed(3)}]  mean ${(sum / n).toFixed(3)}   closed-form err ${maxerr.toExponential(1)}`);
    check(`  ${name}: matches closed form`, maxerr, 0, 1e-12);
  }
  console.log('  -> U is NOT constant in any mode; it ripples at 2*omega.');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
