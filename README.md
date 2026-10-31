# Generative Art v002

Versions (each one is a button): V1 Line (WebGPU, from generativeArt_v001) and Ishihara (packed circles, Canvas 2D).

- Live: https://isifoo.github.io/generativeArt_v002/
- Settings button opens the slider panel. Every slider has a max field and a -1 on/off box.
- The sim pauses while a slider is dragged and catches up 0.25 s after release.
- New slider: one entry in `SLIDERS` in `line.js`.
- Local: `python -m http.server` in this folder, open http://localhost:8000/ (`?nocam` skips the camera).
- Ishihara: `?view=ishihara`. Contrast split (auto levels + Otsu + contrast curve) picks figure vs ground; circles never overlap, grow only into free room (Pastiche style), and ease size and colour (smooth damp).
- Shared UI (version buttons, sliders, camera, defaults) is in `ui.js`.
