# MANUKA

Audio-reactive WebGL visualizer. Three.js is a thin harness; all visuals live in custom GLSL (raymarch → ping-pong feedback → composite). React drives audio/UI only — it never updates from the render loop.

## Run

```bash
npm install
npm run dev
```

Open the local URL, then use **Mic** or **Load file** (user gesture required for audio).

```bash
npm run build    # typecheck + production build
npm run preview  # serve dist/
npm run lint     # oxlint
```

## Presets

| Name | Idea |
|------|------|
| **Pulse** | Soft orb cluster + torus, domain-warped |
| **Lattice** | Infinite symmetrical truss, music-driven camera |
| **Storm** | Gyroid-like field + octahedra |
| **Torus** | Wireframe cube cage with bouncing toruses |
| **Girih** | 8-fold sacred-geometry rosettes; centered tunnel flight |

Preset pills in the HUD set `uPreset` and swap default feedback decay/warp.

## Look (filters)

Composite-only post looks: **Standard**, **Clean**, **Neon**, **VHS**, **Mono**, **CRT**, **Film**. Controlled via `uFilter`.

## Architecture

```
src/
├── audio/          Web Audio engine + band/beat extraction
├── glsl/           raymarch / feedback / composite + SDF/noise commons
├── webgl/          Pipeline, uniforms, dynamic resolution scaler
├── visual/         Filter registry
├── ui/             Overlay HUD + lil-gui debug panel
└── App.tsx         Harness only
```

**Pipeline each frame:** raymarch HDR scene → feedback (ping-pong) → composite to canvas.

## Notes

- Audio bands (bass / mid / high / rms / beat) write into uniforms and 1D `DataTexture`s (spectrum + waveform).
- Internal resolution scales with a rolling frame budget (`DynamicScaler`, ~0.4–1.0).
- lil-gui (top right) exposes decay, warp, exposure, filter, envelopes, and live meters.
- Raymarch budget: 72 steps, max distance 52, surface ε 0.002.
