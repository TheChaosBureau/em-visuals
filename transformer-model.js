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

// Wye synthesis: x(t) = Re[X·e^{jωt}] = wc·cos(ωt) + ws·sin(ωt)
export function toWcWs(X) {
  return [X[0], -X[1]];
}

// Full phasor circuit solve for given load (resistance in ohms, normalized to IsFull).
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
