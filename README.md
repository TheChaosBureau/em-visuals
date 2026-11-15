# Electromagnetic visuals

Interactive Three.js field visualizations, including an immersive WebXR view for Meta Quest.

## Pages

- `rotating-field-machine.html` — Rotating-field 2-pole machine, E and B
- `delta-wye-transformer.html` — 3-phase delta–wye transformer on a 3-limb core (Dy11): core flux, leakage B, induced E
- `overhead-line-power-flow.html` — Sagging 3-phase overhead line: E × H, Poynting flow, and four-quadrant P–Q operation
- `power-box.html` — Power as a rectangle (potential × flow) pulled through time into a box whose volume is energy; steady, or sinusoidal with a phase offset

## Run locally

WebXR requires HTTPS outside `localhost`. For desktop development, serve the repository and open either page:

```sh
python3 -m http.server 8000
```

The published build is deployed by GitHub Actions to `https://thechaosbureau.github.io/em-visuals/`, with the machine page as the site root.

## Quest controls (`rotating-field-machine.html`)

- Point at either motor and hold the controller trigger to pick it up; release the trigger to place it
- Each controller can hold a different motor at the same time
- On release, the transformed winding and combined electromagnetic field are recomputed for the motor's new position and orientation
- A: play or pause
- B: reset both motors plus the shared placement, rotation, and scale
- Right stick: rotate the scene while no motor is held
- Left stick up/down: scale the scene while no motor is held

Configure field and machine options in the browser panel before selecting **Enter VR**.

`delta-wye-transformer.html` is view-only in XR: orbit/rotate and scale the whole scene with the right/left thumbsticks, but there is nothing to grab.

## Desktop motor controls (`rotating-field-machine.html`)

- Drag a motor to move it parallel to the screen
- Shift-drag a motor to move it toward or away from the camera
- Right-drag a motor to rotate it
- Releasing the motor recomputes the combined electromagnetic field

`delta-wye-transformer.html` is view-only on desktop too: drag to orbit, shift-drag to pan, scroll to zoom — no grab.

## Power box (`power-box.html`)

No fields in this one: power is drawn as an area and energy as a volume.

- Two edges, **potential** (volts) and **flow** (amperes), span a rectangle whose area is **power** (watts). A time axis pulls the rectangle into a box whose volume is **energy** (joules).
- Every edge is coloured by the quantity it measures, so every face is framed by its two factors: potential × flow = power (W), flow × time = charge (C), potential × time = volt-seconds (V·s).
- The defaults are 12 V, 2 A and 3 s: 24 W, 6 C, 36 V·s and 72 J. With the unit grid on, each cell on a face is one unit of that product.
- **Steady** mode keeps the cross-section constant. **Sinusoidal** mode draws v = V̂ cos ωt and i = Î cos(ωt − φ) as slices along time, each the rectangle |v| × |i| of its instant; slices where v·i < 0 are red (power flowing back), and the readout keeps the signed energy up to the playhead.
- Panel: potential, flow, duration, mode, phase φ, frequency, playhead. Drag to orbit, shift-drag to pan, scroll or pinch to zoom.
- In XR the page is view-only like the transformer: right stick rotates, left stick scales, A replays the sweep through time, B resets the placement. Labels become sprites in the scene; `?labels=sprite` previews that on a flat screen.

The quantities live in `power-box-model.js` (pure functions, tested against the closed forms).

## Scripted scenes

Three small modules turn a page into something that can be replayed and rendered frame by frame. They have no dependencies and are used by `power-box.html`; `rotating-field-machine.html` uses the first two.

- `scene-clock.js` — the page's one source of time. Real time by default (unchanged behaviour); fixed step when the URL says so. A page calls `clock.tick(now)` at the top of its animation loop, takes its state from `clock.time` in fixed step, and calls `clock.drawn()` after rendering.
- `timeline.js` — a timeline is a JSON object: duration, keyframes for the camera pose (position or orbit, target, field of view) and for named numeric scene parameters, each key with an easing (`linear`, `ease-in`, `ease-out`, `ease-in-out`, `hold`), plus caption, label and equation cues. `stateAt(t)` is a pure function of `t`, so frames can be drawn in any order. The format is described at the top of the file.
- `overlay.js` — draws the cues: captions in the lower third, labels attached to points in the scene (projected every frame and kept off the geometry), and equations set as SVG text by a small built-in formatter (`p = v × i`, `E = ∫ p dt`, `V_rms`, `x^2`, units). Text stays 5 % from every edge, and in a vertical frame clear of the top 12 % and bottom 20 %. Nothing is fetched at run time.

### URL parameters

| Parameter | Effect |
| --- | --- |
| `fps=30&frame=120` | Fixed-step mode: draw exactly the state at t = frame / fps, then set `window.__frameReady = true`. Either parameter alone selects the mode (`fps` defaults to 30, `frame` to 0). `window.__setFrame(n)` selects another frame and resolves once it is drawn. |
| `timeline=<url>` | Load a timeline and let it drive the camera, the parameters and the cues. In real time it loops; with `fps`/`frame` it shows that frame. |
| `ui=0` | `power-box.html`: hide the panel and controls, leaving the bare stage. |
| `px=2` | `power-box.html`: canvas pixels per CSS pixel (supersampling). |
| `labels=sprite` | `power-box.html`: draw labels as in-scene sprites, as in WebXR. |

For example, `power-box.html?timeline=timelines/power-box-steady.json` plays the script in the page, and `power-box.html?timeline=timelines/power-box-steady.json&fps=30&frame=270&ui=0` shows one frame of it. Shipped timelines, 20 s each: `timelines/power-box-steady.json`, `timelines/power-box-sine.json` and `timelines/rotating-field-orbit.json`.

A timeline's `fov` spans the short side of the frame, so the same script frames a 16:9 and a 9:16 render alike. Parameters understood by `power-box.html`: `potential`, `flow`, `duration`, `mode` (0 steady … 1 sinusoidal), `phase` (degrees), `frequency`, `playhead` (seconds pulled through time), `fill` (0 … 1, how far the rectangle has been swept open) and `grid`. `rotating-field-machine.html` understands `phase` (ωt in degrees).

### Render to video

`tools/render.mjs` drives a headless Chromium over a timeline: it opens the page in fixed-step mode, steps `window.__setFrame(n)` through the clip in one browser session, screenshots each frame as PNG, and pipes the frames to ffmpeg (H.264, yuv420p, MP4). Presets: `wide` 1920×1080 and `vertical` 1080×1920, 30 frames per second.

```sh
npm install --prefix tools      # once: playwright-core only, no browser download
node tools/render.mjs --timeline timelines/power-box-steady.json --out out
```

That writes `out/power-box-steady-wide.mp4` and `out/power-box-steady-vertical.mp4`, plus a `.frames.sha256` list of frame hashes for each. The site itself still has no dependencies; the driver is declared in `tools/package.json` only.

The tool needs a Chromium and an ffmpeg that are already installed: pass `--chromium <path>` / `--ffmpeg <path>`, set `CHROMIUM_PATH` / `FFMPEG_PATH`, or have them on `PATH`. With Nix: `nix shell nixpkgs#chromium nixpkgs#ffmpeg -c node tools/render.mjs --timeline …`.

Useful options (`--help` lists all): `--preset wide|vertical|both`, `--stills 0,90,300` to also save those frames as PNG, `--stills-only`, `--keep-frames`, `--frames 0-149`, `--supersample 2` for smoother edges at a longer render time, and `--verify 12` to redraw 12 frames in a fresh page, in reverse order, and require byte-identical PNGs.

Headless WebGL: the tool launches Chromium with

```
--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist
--force-color-profile=srgb --font-render-hinting=none --disable-lcd-text --hide-scrollbars
```

The first line selects ANGLE's software rasterizer (SwiftShader), which is what worked here with Chromium 143 on a machine with no GPU (WebGL 2, 4× MSAA); the second keeps colour and text rendering the same from run to run. Rendering is on the CPU: on a 12-core machine a 20 s power-box clip (600 frames) took about two minutes per preset, and the rotating-field clip, which retraces its field lines every frame, about eight. Text uses the fonts installed on the rendering machine.

A frame is a function of its number only: the same frame drawn in another page, after different frames, or after loading at a different frame gives a byte-identical PNG on the same machine. `--verify` checks exactly that, and two runs can be compared by their `.frames.sha256` files.

## Verify

```sh
npm test
```

This runs the test suites, then `verify_fields.js` (machine page) and `verify_transformer.js` (transformer page).

Three.js `0.185.1` and its WebXR `VRButton` helper are vendored under `vendor/`; see `vendor/THREE-LICENSE.txt`.
