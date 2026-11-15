// Timeline: a JSON description of a scripted scene, evaluated without state.
//
//   {
//     "duration": 20,                    seconds
//     "fps": 30,                         optional hint for the capture tool
//     "page": "power-box.html",          optional: the page this script drives
//     "up": [0, 1, 0],                   optional: the scene's up axis
//     "ease": "linear",                  optional: default easing for every key
//     "camera": [                        keyframes of the camera pose
//       { "t": 0, "position": [x, y, z], "target": [x, y, z], "fov": 30 },
//       { "t": 4, "orbit": { "azimuth": -35, "elevation": 20, "distance": 8 }, "ease": "ease-in-out" }
//     ],
//     "params": {                        named numeric scene parameters
//       "potential": [[0, 0], [2, 12, "ease-in-out"]],
//       "flow": [{ "t": 2, "value": 0 }, { "t": 4, "value": 2, "ease": "ease-out" }],
//       "duration": 3
//     },
//     "cues": [                          captions, labels and equations
//       { "type": "caption", "in": 1, "out": 5, "text": "…" },
//       { "type": "label", "in": 1, "out": 20, "anchor": "potential", "title": "potential", "text": "{potential}" },
//       { "type": "equation", "in": 4, "out": 9, "text": "p = v × i" }
//     ]
//   }
//
// A key's "ease" shapes the segment that ARRIVES at that key. Before the first
// key a track holds its first value, after the last key its last value.
//
// Camera keys are interpolated as an orbit about the (interpolated) target:
// azimuth, elevation and distance each move linearly in the eased parameter, so
// a move between two viewpoints swings around the subject instead of cutting
// through it. "path": "line" on a key moves the camera position along a
// straight line instead. A key may omit position/target/fov to keep the
// previous key's value. "fov" is measured across the SHORT side of the frame
// (see shortSideFov), so one script frames a wide and a vertical render alike.
//
// stateAt(timeline, t) is a pure function of t: no clocks, no caches, no
// memory of earlier calls. Frames can be evaluated in any order.

export const EASINGS = Object.freeze({
  linear: u => u,
  'ease-in': u => u * u * u,
  'ease-out': u => 1 - (1 - u) ** 3,
  'ease-in-out': u => u < 0.5 ? 4 * u * u * u : 1 - ((2 - 2 * u) ** 3) / 2,
  hold: u => u < 1 ? 0 : 1
});
export const CUE_TYPES = Object.freeze(['caption', 'label', 'equation']);
export const DEFAULT_FOV = 30;
export const DEFAULT_FADE = 0.4;

const RAD = Math.PI / 180, TAU = Math.PI * 2;
const clamp01 = u => u < 0 ? 0 : u > 1 ? 1 : u;
const smooth = u => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export function ease(name, u) {
  const fn = EASINGS[name];
  if (!fn) throw new RangeError(`unknown easing "${name}"`);
  return fn(clamp01(u));
}

function vec3(value, what) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new TypeError(`${what} must be three numbers`);
  return [value[0], value[1], value[2]];
}

function unit(v, what) {
  const a = vec3(v, what), m = Math.hypot(a[0], a[1], a[2]);
  if (!(m > 0)) throw new RangeError(`${what} must not be zero`);
  return scale(a, 1 / m);
}

function easingName(name, what) {
  if (!(name in EASINGS)) throw new RangeError(`${what}: unknown easing "${name}"`);
  return name;
}

// Azimuth is measured about `up`, from the frame's first horizontal axis toward
// its second: with up = +Y that is from +Z toward +X; with up = +Z, +X toward +Y.
function orbitFrame(up) {
  const ref = Math.abs(up[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const e1raw = sub(ref, scale(up, dot(ref, up)));
  const e1 = scale(e1raw, 1 / Math.hypot(e1raw[0], e1raw[1], e1raw[2]));
  return { e1, e2: cross(up, e1), up };
}

function toOrbit(offset, frame) {
  const distance = Math.hypot(offset[0], offset[1], offset[2]);
  if (!(distance > 0)) throw new RangeError('camera position must differ from its target');
  return {
    azimuth: Math.atan2(dot(offset, frame.e2), dot(offset, frame.e1)),
    elevation: Math.asin(Math.max(-1, Math.min(1, dot(offset, frame.up) / distance))),
    distance
  };
}

function fromOrbit(o, frame) {
  const c = Math.cos(o.elevation) * o.distance;
  return add(add(scale(frame.e1, c * Math.cos(o.azimuth)), scale(frame.e2, c * Math.sin(o.azimuth))), scale(frame.up, Math.sin(o.elevation) * o.distance));
}

function normalizeTrack(name, raw, defaultEase) {
  const list = typeof raw === 'number' ? [[0, raw]] : raw;
  if (!Array.isArray(list) || !list.length) throw new TypeError(`params.${name} must be a number or a non-empty list of keys`);
  const keys = list.map((key, i) => {
    const k = Array.isArray(key) ? { t: key[0], value: key[1], ease: key[2] } : key;
    if (!k || !Number.isFinite(k.t) || !Number.isFinite(k.value)) throw new TypeError(`params.${name}[${i}] needs a numeric t and value`);
    return { t: k.t, value: k.value, ease: easingName(k.ease ?? defaultEase, `params.${name}[${i}]`) };
  });
  for (let i = 1; i < keys.length; i++) if (!(keys[i].t > keys[i - 1].t)) throw new RangeError(`params.${name}: key times must increase`);
  return keys;
}

function normalizeCamera(raw, frame, defaultEase) {
  if (!Array.isArray(raw)) throw new TypeError('camera must be a list of keys');
  const keys = [];
  raw.forEach((k, i) => {
    const what = `camera[${i}]`, prev = keys[i - 1];
    if (!k || !Number.isFinite(k.t)) throw new TypeError(`${what} needs a numeric t`);
    if (prev && !(k.t > prev.t)) throw new RangeError('camera: key times must increase');
    const target = k.target ? vec3(k.target, `${what}.target`) : prev?.target;
    if (!target) throw new TypeError(`${what} needs a target`);
    // A key authored as an orbit keeps its azimuth as written, so a pair of
    // orbit keys can turn more than half a circle; a key authored as a position
    // is reached along the shorter arc.
    let orbit, position = null, authoredOrbit = false;
    if (k.orbit) {
      const { azimuth, elevation, distance } = k.orbit;
      if (![azimuth, elevation, distance].every(Number.isFinite) || !(distance > 0)) throw new TypeError(`${what}.orbit needs azimuth, elevation (degrees) and a positive distance`);
      orbit = { azimuth: azimuth * RAD, elevation: elevation * RAD, distance }; authoredOrbit = true;
    } else if (k.position) {
      position = vec3(k.position, `${what}.position`);
    } else if (prev?.authoredOrbit) {
      orbit = { ...prev.orbit }; authoredOrbit = true;
    } else if (prev) {
      position = prev.position;
    } else throw new TypeError(`${what} needs a position or an orbit`);
    if (position) orbit = toOrbit(sub(position, target), frame);
    else position = add(target, fromOrbit(orbit, frame));
    const fov = k.fov ?? prev?.fov ?? DEFAULT_FOV;
    if (!(fov > 0 && fov < 180)) throw new RangeError(`${what}.fov must be between 0 and 180 degrees`);
    const path = k.path ?? 'orbit';
    if (path !== 'orbit' && path !== 'line') throw new RangeError(`${what}.path must be "orbit" or "line"`);
    keys.push({ t: k.t, target, orbit, authoredOrbit, position, fov, path, ease: easingName(k.ease ?? defaultEase, what) });
  });
  return keys;
}

function normalizeCue(raw, i) {
  const what = `cues[${i}]`;
  if (!raw || !CUE_TYPES.includes(raw.type)) throw new RangeError(`${what}.type must be one of ${CUE_TYPES.join(', ')}`);
  if (!Number.isFinite(raw.in) || !Number.isFinite(raw.out) || !(raw.out > raw.in)) throw new RangeError(`${what} needs in < out, in seconds`);
  if (typeof raw.text !== 'string' && typeof raw.title !== 'string') throw new TypeError(`${what} needs text`);
  if (raw.type === 'label' && typeof raw.anchor !== 'string' && !Array.isArray(raw.anchor)) throw new TypeError(`${what} needs an anchor`);
  const fade = raw.fade ?? DEFAULT_FADE;
  if (!(fade >= 0)) throw new RangeError(`${what}.fade must not be negative`);
  return { ...raw, id: `${raw.type}-${i}`, fade: Math.min(fade, (raw.out - raw.in) / 2) };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

// Validate a timeline object and return an immutable, normalized copy with a
// stateAt(t) method.
export function createTimeline(raw) {
  if (!raw || typeof raw !== 'object') throw new TypeError('timeline must be an object');
  const duration = Number(raw.duration);
  if (!(duration > 0) || !Number.isFinite(duration)) throw new RangeError('timeline.duration must be a positive number of seconds');
  const defaultEase = easingName(raw.ease ?? 'linear', 'timeline.ease');
  const up = unit(raw.up ?? [0, 1, 0], 'timeline.up');
  const frame = orbitFrame(up);
  const params = {};
  for (const [name, keys] of Object.entries(raw.params ?? {})) params[name] = normalizeTrack(name, keys, defaultEase);
  const timeline = {
    duration,
    fps: raw.fps > 0 ? Number(raw.fps) : null,
    page: typeof raw.page === 'string' ? raw.page : null,
    up, frame,
    camera: normalizeCamera(raw.camera ?? [], frame, defaultEase),
    params,
    cues: (raw.cues ?? []).map(normalizeCue)
  };
  timeline.stateAt = t => stateAt(timeline, t);
  return deepFreeze(timeline);
}

// The pair of keys around t and the eased position between them.
function segment(keys, t) {
  const n = keys.length;
  if (t <= keys[0].t) return [keys[0], keys[0], 0];
  if (t >= keys[n - 1].t) return [keys[n - 1], keys[n - 1], 0];
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  return [a, b, EASINGS[b.ease](clamp01((t - a.t) / (b.t - a.t)))];
}

function sampleTrack(keys, t) {
  const [a, b, u] = segment(keys, t);
  return lerp(a.value, b.value, u);
}

function shortestArc(delta) {
  return delta - TAU * Math.round(delta / TAU);
}

function sampleCamera(timeline, t) {
  const keys = timeline.camera;
  if (!keys.length) return null;
  const [a, b, u] = segment(keys, t);
  const up = [...timeline.up];
  if (a === b) return { position: [...a.position], target: [...a.target], fov: a.fov, up };
  const target = lerp3(a.target, b.target, u), fov = lerp(a.fov, b.fov, u);
  if (b.path === 'line') return { position: lerp3(a.position, b.position, u), target, fov, up };
  const turn = b.orbit.azimuth - a.orbit.azimuth;
  const orbit = {
    azimuth: a.orbit.azimuth + (a.authoredOrbit && b.authoredOrbit ? turn : shortestArc(turn)) * u,
    elevation: lerp(a.orbit.elevation, b.orbit.elevation, u),
    distance: lerp(a.orbit.distance, b.orbit.distance, u)
  };
  return { position: add(target, fromOrbit(orbit, timeline.frame)), target, fov, up };
}

// Opacity of a cue at time t: zero outside [in, out], a smooth fade at each end.
export function cueAlpha(cue, t) {
  if (!(t >= cue.in && t <= cue.out)) return 0;
  if (!(cue.fade > 0)) return 1;
  return smooth(clamp01((t - cue.in) / cue.fade)) * smooth(clamp01((cue.out - t) / cue.fade));
}

// The whole scripted state at time t (seconds): camera pose (or null when the
// timeline has no camera track), every named parameter, and the visible cues
// with their opacity.
export function stateAt(timeline, t) {
  const time = Number.isFinite(t) ? t : 0;
  const params = {};
  for (const name of Object.keys(timeline.params)) params[name] = sampleTrack(timeline.params[name], time);
  const cues = [];
  for (const cue of timeline.cues) {
    const alpha = cueAlpha(cue, time);
    if (alpha > 0) cues.push({ ...cue, alpha });
  }
  return { t: time, camera: sampleCamera(timeline, time), params, cues };
}

// Frames 0 … frameCount − 1 cover the timeline at the given rate.
export function frameCount(timeline, fps = timeline.fps ?? 30) {
  return Math.max(1, Math.round(timeline.duration * fps));
}

// The timeline's "fov" spans the short side of the frame. Three.js wants the
// vertical field of view, which is the same angle in a wide frame and a larger
// one in a tall frame.
export function shortSideFov(fov, aspect) {
  if (aspect >= 1) return fov;
  return 2 * Math.atan(Math.tan(fov * RAD / 2) / aspect) / RAD;
}

export async function loadTimeline(url, fetchJson = async u => {
  const response = await fetch(u);
  if (!response.ok) throw new Error(`timeline ${u}: HTTP ${response.status}`);
  return response.json();
}) {
  return createTimeline(await fetchJson(url));
}
