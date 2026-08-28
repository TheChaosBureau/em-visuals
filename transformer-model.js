// Three-phase delta-wye transformer model with magnetizing branch.
// Phasor convention: x(t) = Re[X·e^{jωt}] ⟹ (wc, ws) = (Re X, −Im X)
// Time-phase: V_A ∠0°, V_B ∠−120°, V_C ∠+120° (positive sequence)
// Delta windings: k=0 across A-B, k=1 across B-C, k=2 across C-A
// Wye secondary: same polarity as primary. Dy11 group (+30° secondary lead).
// All voltages, currents, fluxes are triples indexed by limb k ∈ {0,1,2}.

export const ELEC = { V: 1, Np: 1, Ns: 0.5, omega: 1, reluct: 0.03, IsFull: 1 };

// Phasor algebra as [re, im]
export const C = {
  add(a, b) { return [a[0] + b[0], a[1] + b[1]]; },
  sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; },
  mul(a, b) { return [a[0]*b[0] - a[1]*b[1], a[0]*b[1] + a[1]*b[0]]; },
  scale(a, k) { return [a[0]*k, a[1]*k]; },
  abs(a) { return Math.sqrt(a[0]*a[0] + a[1]*a[1]); },
  arg(a) { return Math.atan2(a[1], a[0]); }
};

// Time synthesis: x(t) = Re[X·e^{jωt}] = wc·cos(ωt) + ws·sin(ωt)
export function toWcWs(X) {
  return [X[0], -X[1]];
}

// Full phasor circuit solve for given load (per-unit current-demand fraction:
// 0 = open circuit, 1 = full-load secondary current).
export function solve(load) {
  const { V, Np, Ns, omega, reluct, IsFull } = ELEC;

  // Primary line-neutral voltages (balanced 3-phase, V_A ∠0°, V_B ∠−120°, V_C ∠+120°)
  const ang = k => -k * 2 * Math.PI / 3;
  const VL = [0,1,2].map(k => [V * Math.cos(ang(k)), V * Math.sin(ang(k))]);

  // Primary delta winding voltages (line-line): V_AB, V_BC, V_CA
  const Up = [0,1,2].map(k => C.sub(VL[k], VL[(k+1)%3]));

  // Flux linkage (Faraday): PHI = Up / (j·ω·Np)
  const PHI = Up.map(u => C.mul(u, [0, -1/(omega*Np)]));

  // Secondary induced EMF (turns ratio)
  const Vs = Up.map(u => C.scale(u, Ns/Np));

  // Secondary load current (resistive, in-phase with Vs, scaled by load and IsFull)
  const Is = Vs.map(v => C.scale(v, load * IsFull / C.abs(Vs[0])));

  // Magnetizing current (linear reluctance)
  const Imag = PHI.map(p => C.scale(p, reluct/Np));

  // Primary current (MMF balance)
  const Ip = [0,1,2].map(k => C.add(Imag[k], C.scale(Is[k], Ns/Np)));

  // Line currents (current law in delta: I_A = I_p(AB) - I_p(CA))
  const IlineP = [0,1,2].map(k => C.sub(Ip[k], Ip[(k+2)%3]));

  // Voltage ratio (line-line)
  const VabP = Up[0];
  const VabS = C.sub(Vs[0], Vs[1]);
  const lineLine = C.abs(VabS) / C.abs(VabP);
  const angleDeg = (C.arg(VabS) - C.arg(VabP)) * 180 / Math.PI;

  // Power (lossless 3-phase)
  const re = (a, b) => a[0]*b[0] + a[1]*b[1]; // Re(X·conj(Y))
  const pOut = 3 * re(Vs[0], Is[0]);
  const pIn = [0,1,2].reduce((a, k) => a + re(VL[k], IlineP[k]), 0);

  return {
    VL, Up, PHI, Vs, Is, Imag, Ip, IlineP,
    ratios: { lineLine, angleDeg },
    power: { pIn, pOut }
  };
}

// --- Core and winding geometry -------------------------------------------
// Core stands in the x-z plane: limbs vertical along z at x = limbX[k],
// yokes horizontal along x at z = ±limbTop. Winding loops are horizontal
// circles (constant-z planes) centered on a limb's axis (limbX[k], y=0).
// Loop winding sense is counterclockwise viewed from +z (increasing angle
// in the standard x-right/y-up frame), so positive current gives +z flux
// (right-hand rule).

export const GEOM = {
  limbX: [-2.2, 0, 2.2], limbTop: 1.6,
  rCore: 0.30, rLV: 0.42, rHV: 0.58,
  nLoops: 12, segsPerLoop: 24, windHalf: 1.1
};

// Emit a segsPerLoop-gon loop of radius r centered at (cx, 0, z), CCW from +z,
// with per-segment weight [wc, ws], into SEG starting at flat index base.
function emitLoop(SEG, base, cx, r, z, wc, ws, segsPerLoop) {
  for (let j = 0; j < segsPerLoop; j++) {
    const th0 = j * 2 * Math.PI / segsPerLoop;
    const th1 = (j + 1) * 2 * Math.PI / segsPerLoop;
    const off = base + j * 8;
    SEG[off]     = cx + r * Math.cos(th0);
    SEG[off + 1] = r * Math.sin(th0);
    SEG[off + 2] = z;
    SEG[off + 3] = cx + r * Math.cos(th1);
    SEG[off + 4] = r * Math.sin(th1);
    SEG[off + 5] = z;
    SEG[off + 6] = wc;
    SEG[off + 7] = ws;
  }
}

// Winding source segments: for each limb, nLoops loops at rHV (primary) and
// nLoops at rLV (secondary), the balanced ampere-turn pair. Primary carries
// Ns·Is[k] (Np·(Ns/Np)·Is reflected); secondary carries −Ns·Is[k]. Each
// drawn loop carries 1/nLoops of its winding's total. Magnetizing current
// is deliberately not represented here.
export function windingSegs(sol) {
  const { limbX, nLoops, segsPerLoop, rLV, rHV, windHalf } = GEOM;
  const { Ns } = ELEC;
  const SEG = new Float32Array(3 * 2 * nLoops * segsPerLoop * 8);
  const zAt = i => -windHalf + i * (2 * windHalf) / (nLoops - 1);

  let base = 0;
  for (let k = 0; k < 3; k++) {
    const [wcP, wsP] = C.scale(toWcWs(C.scale(sol.Is[k], Ns)), 1 / nLoops);
    const [wcS, wsS] = C.scale(toWcWs(C.scale(sol.Is[k], -Ns)), 1 / nLoops);
    for (let i = 0; i < nLoops; i++) {
      emitLoop(SEG, base, limbX[k], rHV, zAt(i), wcP, wsP, segsPerLoop);
      base += segsPerLoop * 8;
    }
    for (let i = 0; i < nLoops; i++) {
      emitLoop(SEG, base, limbX[k], rLV, zAt(i), wcS, wsS, segsPerLoop);
      base += segsPerLoop * 8;
    }
  }
  return SEG;
}

// Flux mesh-loop segments: two rectangles in the y=0 plane along the core
// centerline, mesh L spanning limbs 0-1 and mesh R spanning limbs 1-2.
// Traversal goes up the rectangle's left limb (smaller x), so positive mesh
// flux = +z flux in that limb; both rectangles share this convention so
// their contributions superpose correctly on the shared limb 1 path.
export function fluxLoopSegs(sol) {
  const { limbX, limbTop } = GEOM;
  const SEG = new Float64Array(2 * 4 * 8);
  const meshes = [
    [limbX[0], limbX[1], C.scale(toWcWs(sol.PHI[0]), 1 / (4 * Math.PI))],
    [limbX[1], limbX[2], C.scale(toWcWs(C.scale(sol.PHI[2], -1)), 1 / (4 * Math.PI))]
  ];
  meshes.forEach(([xL, xR, [wc, ws]], r) => {
    const pts = [
      [xL, 0, -limbTop],
      [xL, 0,  limbTop],
      [xR, 0,  limbTop],
      [xR, 0, -limbTop]
    ];
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      const off = (r * 4 + i) * 8;
      SEG[off]     = a[0]; SEG[off + 1] = a[1]; SEG[off + 2] = a[2];
      SEG[off + 3] = b[0]; SEG[off + 4] = b[1]; SEG[off + 5] = b[2];
      SEG[off + 6] = wc;   SEG[off + 7] = ws;
    }
  });
  return SEG;
}

// Flux bundle spans for display: three vertical limb spans carrying PHI[k],
// plus top- and bottom-yoke spans carrying the mesh fluxes that connect
// them (bottom yoke mirrors the top with the sign flipped: return path).
export function fluxBundleSpans() {
  const { limbX, limbTop } = GEOM;
  const spans = [];
  for (let k = 0; k < 3; k++) {
    spans.push({
      kind: 'limb', k,
      from: [limbX[k], -limbTop], to: [limbX[k], limbTop],
      phasorOf: sol => sol.PHI[k]
    });
  }
  spans.push({
    kind: 'yoke',
    from: [limbX[0], limbTop], to: [limbX[1], limbTop],
    phasorOf: sol => sol.PHI[0]
  });
  spans.push({
    kind: 'yoke',
    from: [limbX[1], limbTop], to: [limbX[2], limbTop],
    phasorOf: sol => C.scale(sol.PHI[2], -1)
  });
  spans.push({
    kind: 'yoke',
    from: [limbX[0], -limbTop], to: [limbX[1], -limbTop],
    phasorOf: sol => C.scale(sol.PHI[0], -1)
  });
  spans.push({
    kind: 'yoke',
    from: [limbX[1], -limbTop], to: [limbX[2], -limbTop],
    phasorOf: sol => sol.PHI[2]
  });
  return spans;
}
