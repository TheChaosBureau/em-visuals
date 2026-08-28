# Electromagnetic visuals

Interactive Three.js field visualizations, including an immersive WebXR view for Meta Quest.

## Run locally

WebXR requires HTTPS outside `localhost`. For desktop development, serve the repository and open `rotating-field-machine.html`:

```sh
python3 -m http.server 8000
```

The published build is deployed by GitHub Actions to `https://thechaosbureau.github.io/em-visuals/`.

## Quest controls

- Point at either motor and hold the controller trigger to pick it up; release the trigger to place it
- Each controller can hold a different motor at the same time
- On release, the transformed winding and combined electromagnetic field are recomputed for the motor's new position and orientation
- A: play or pause
- B: reset both motors plus the shared placement, rotation, and scale
- Right stick: rotate the scene while no motor is held
- Left stick up/down: scale the scene while no motor is held

Configure field and machine options in the browser panel before selecting **Enter VR**.

## Desktop motor controls

- Drag a motor to move it parallel to the screen
- Shift-drag a motor to move it toward or away from the camera
- Right-drag a motor to rotate it
- Releasing the motor recomputes the combined electromagnetic field

## Verify

```sh
npm test
```

Three.js `0.185.1` and its WebXR `VRButton` helper are vendored under `vendor/`; see `vendor/THREE-LICENSE.txt`.
