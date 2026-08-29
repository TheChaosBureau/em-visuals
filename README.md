# Electromagnetic visuals

Interactive Three.js field visualizations, including an immersive WebXR view for Meta Quest.

## Pages

- `rotating-field-machine.html` — Rotating-field 2-pole machine, E and B
- `delta-wye-transformer.html` — 3-phase delta–wye transformer on a 3-limb core (Dy11): core flux, leakage B, induced E

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

## Verify

```sh
npm test
```

This runs the test suites, then `verify_fields.js` (machine page) and `verify_transformer.js` (transformer page).

Three.js `0.185.1` and its WebXR `VRButton` helper are vendored under `vendor/`; see `vendor/THREE-LICENSE.txt`.
