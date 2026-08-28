# Electromagnetic visuals

Interactive Three.js field visualizations, including an immersive WebXR view for Meta Quest.

## Run locally

WebXR requires HTTPS outside `localhost`. For desktop development, serve the repository and open `rotating-field-machine.html`:

```sh
python3 -m http.server 8000
```

The published build is deployed by GitHub Actions to `https://thechaosbureau.github.io/em-visuals/`.

## Quest controls

- A: play or pause
- B: reset placement, rotation, and scale
- Right stick: rotate
- Left stick up/down: scale

Configure field and machine options in the browser panel before selecting **Enter VR**.

## Verify

```sh
npm test
```

Three.js `0.185.1` and its WebXR `VRButton` helper are vendored under `vendor/`; see `vendor/THREE-LICENSE.txt`.
