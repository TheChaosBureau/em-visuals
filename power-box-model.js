// Power as an area, energy as a volume.
//
// A potential v (volts) and a flow i (amperes) span a rectangle whose area is
// the power p = v·i (watts). Pulling that rectangle along a time axis sweeps
// out a solid whose volume is the energy E = ∫ p dt (joules).
//
//   params = { potential, flow, duration, mode, phi, frequency }
//     potential  V   steady value, or the peak V̂ of the sinusoid
//     flow       A   steady value, or the peak Î of the sinusoid
//     duration   s   length of the time axis
//     mode           0 = steady, 1 = sinusoidal; values between blend the two
//     phi        rad phase by which the flow lags the potential
//     frequency  Hz  of the sinusoid
//
//   v(t) = V · ((1 − mode) + mode · cos(ωt))
//   i(t) = I · ((1 − mode) + mode · cos(ωt − φ))
//
// Every function here is pure.

const TAU = Math.PI * 2;

export const DEFAULTS = Object.freeze({ potential: 12, flow: 2, duration: 3, mode: 0, phi: 0, frequency: 1 });

const omega = p => TAU * p.frequency;

export function potentialAt(p, t) {
  return p.potential * ((1 - p.mode) + p.mode * Math.cos(omega(p) * t));
}

export function flowAt(p, t) {
  return p.flow * ((1 - p.mode) + p.mode * Math.cos(omega(p) * t - p.phi));
}

// Instantaneous power p(t) = v(t) · i(t). Negative while the flow runs against
// the potential: power is on its way back to the source.
export function powerAt(p, t) {
  return potentialAt(p, t) * flowAt(p, t);
}

// ∫₀ᵗ cos(ωs − φ) ds, with the ω → 0 limit.
function cosIntegral(w, phi, t) {
  return w > 1e-12 ? (Math.sin(w * t - phi) + Math.sin(phi)) / w : t * Math.cos(phi);
}

// Volt-seconds ∫₀ᵗ v ds: the area of the potential × time face.
export function voltSecondsAt(p, t) {
  return p.potential * ((1 - p.mode) * t + p.mode * cosIntegral(omega(p), 0, t));
}

// Charge ∫₀ᵗ i ds: the area of the flow × time face.
export function chargeAt(p, t) {
  return p.flow * ((1 - p.mode) * t + p.mode * cosIntegral(omega(p), p.phi, t));
}

// Accumulated energy ∫₀ᵗ v·i ds in closed form (signed).
//   steady:                 V · I · t
//   sinusoidal, whole cycles: (V̂/√2) · (Î/√2) · cos φ · t
export function energyAt(p, t) {
  const a = 1 - p.mode, m = p.mode, w = omega(p), phi = p.phi;
  // cos(ωs)·cos(ωs − φ) = ½ [cos φ + cos(2ωs − φ)]
  const product = t * Math.cos(phi) / 2 + cosIntegral(2 * w, phi, t) / 2;
  const cross = cosIntegral(w, 0, t) + cosIntegral(w, phi, t);
  return p.potential * p.flow * (a * a * t + a * m * cross + m * m * product);
}

export const rms = peak => peak / Math.SQRT2;

// Mean power over a whole cycle.
export function meanPower(p) {
  const a = 1 - p.mode, m = p.mode;
  return p.potential * p.flow * (a * a + m * m * Math.cos(p.phi) / 2);
}

// The numbers on the faces of the box drawn up to time t.
export function faces(p, t = p.duration) {
  return { power: powerAt(p, t), charge: chargeAt(p, t), voltSeconds: voltSecondsAt(p, t), energy: energyAt(p, t) };
}

// How many slices the solid is cut into along time: enough to resolve the
// power ripple (twice the supply frequency), never fewer than 48.
export function sliceCount(p) {
  return Math.max(48, Math.min(240, Math.round(32 * p.frequency * p.duration)));
}

// The solid as drawn, up to the playhead `upTo`: slices along time, each with
// the cross-section |v| × |i| taken at the middle of its slot. A slice is
// `negative` where v·i < 0; its signed volume is v·i·Δt. A steady solid has
// the same cross-section throughout and is drawn as one slice: a box.
export function slices(p, upTo = p.duration, n = sliceCount(p)) {
  if (!(p.mode > 0)) n = 1;
  const out = [], dt = p.duration / n, end = Math.min(upTo, p.duration);
  for (let k = 0; k < n; k++) {
    const t0 = k * dt;
    if (!(t0 < end)) break;
    const t1 = Math.min(t0 + dt, end), tm = t0 + dt / 2;
    const v = potentialAt(p, tm), i = flowAt(p, tm), power = v * i;
    out.push({ index: k, t0, t1, tm, v, i, absV: Math.abs(v), absI: Math.abs(i), power, negative: power < 0, volume: power * (t1 - t0) });
  }
  return out;
}

// Signed volume of the drawn solid.
export function slicedEnergy(list) {
  let sum = 0;
  for (const s of list) sum += s.volume;
  return sum;
}

// Fraction of a cycle during which power is negative, measured by sampling.
// For a pure sinusoid this is |φ|/π.
export function backflowFraction(p, samples = 7200) {
  const period = p.frequency > 0 ? 1 / p.frequency : p.duration;
  let negative = 0;
  for (let k = 0; k < samples; k++) if (powerAt(p, (k + 0.5) * period / samples) < 0) negative++;
  return negative / samples;
}
