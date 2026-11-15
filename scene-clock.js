// Scene clock: the one source of time for a page's animation.
//
//   real time (default)       tick(now) returns the wall-clock step in seconds,
//                             clamped to 50 ms exactly as the pages' own loops did.
//   fixed step (?fps=30&frame=120)
//                             time is frame / fps and nothing else, so the same
//                             URL draws the same picture on every load.
//
// In fixed-step mode the clock publishes two hooks for a capture driver:
//   window.__frameReady       true once the selected frame has been drawn
//   window.__setFrame(n)      select frame n; resolves when that frame is drawn
//
// A page adopts the clock by calling tick(now) at the top of its animation loop,
// deriving its state from clock.time when clock.fixed is set, and calling drawn()
// after it has rendered. A frame counts as drawn at the first tick after its
// drawn(): by then the loop has handed the picture to the compositor. From then
// on clock.settled is true, and a page may skip redrawing until the frame
// changes or it calls invalidate() (after user input, a resize, a late load).

export const DEFAULT_FPS = 30;
export const MAX_REAL_STEP = 0.05;

export function parseClockParams(search = '') {
  const q = new URLSearchParams(search);
  const fps = Number(q.get('fps')), frame = Number(q.get('frame'));
  const hasFps = q.has('fps') && Number.isFinite(fps) && fps > 0;
  const hasFrame = q.has('frame') && Number.isInteger(frame) && frame >= 0;
  return {
    fixed: hasFps || hasFrame,
    fps: hasFps ? fps : DEFAULT_FPS,
    frame: hasFrame ? frame : 0,
    timeline: q.get('timeline') || null
  };
}

export function createSceneClock({
  search = globalThis.location?.search ?? '',
  now = () => globalThis.performance.now(),
  host = globalThis.window ?? null
} = {}) {
  const params = parseClockParams(search);
  let last = now(), frame = params.frame, draws = 0, settled = false;
  let time = params.fixed ? frame / params.fps : 0;
  let waiting = [];

  const clock = {
    fixed: params.fixed,
    fps: params.fps,
    timeline: params.timeline,
    get time() { return time; },
    get frame() { return frame; },
    get settled() { return settled; },

    // Real time: advance by the clamped wall-clock step and return it.
    // Fixed step: time does not move here, so the step is zero.
    tick(t = now()) {
      if (clock.fixed) {
        if (draws > 0 && !settled) {
          settled = true;
          if (host) host.__frameReady = true;
          const done = waiting; waiting = [];
          for (const resolve of done) resolve(frame);
        }
        return 0;
      }
      const dt = Math.min(MAX_REAL_STEP, (t - last) / 1000);
      last = t; time += dt;
      return dt;
    },

    // Select frame n (switching to fixed step if needed). The promise resolves
    // once the page has drawn it.
    setFrame(n) {
      if (!Number.isInteger(n) || n < 0) return Promise.reject(new RangeError(`frame must be a non-negative integer, got ${n}`));
      clock.fixed = true;
      frame = n; time = n / clock.fps;
      clock.invalidate();
      return new Promise(resolve => waiting.push(resolve));
    },

    // The page calls this after rendering the state at clock.time.
    drawn() {
      if (clock.fixed) draws++;
    },

    // The picture no longer matches the state (input, resize): draw it again.
    invalidate() {
      if (!clock.fixed) return;
      draws = 0; settled = false;
      if (host) host.__frameReady = false;
    }
  };

  if (clock.fixed && host) {
    host.__frameReady = false;
    host.__setFrame = n => clock.setFrame(n);
  }
  return clock;
}
