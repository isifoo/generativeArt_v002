# Generative Art v002

Versions (each one is a button): V1 Line (WebGPU, from generativeArt_v001) and Ishihara (packed circles, Canvas 2D).

- Live: https://isifoo.github.io/generativeArt_v002/
- Settings button opens the slider panel. Every slider has a max field and a -1 on/off box.
- The sim pauses while a slider is dragged and catches up 0.25 s after release.
- New slider: one entry in `SLIDERS` in `line.js`.
- Local: `python -m http.server` in this folder, open http://localhost:8000/ (`?nocam` skips the camera).
- Ishihara: `?view=ishihara`. The video is drawn with packed circles: auto levels + local contrast + contrast curve -> tone levels on a dark-to-light palette ramp; dark and detailed spots get small circles. Circles never overlap, grow only into free room (Pastiche style), and ease size and colour (smooth damp). Edit > Preview shows the tone map.
- Main page: style buttons + Edit only. Everything else is in the Edit window.
- Shared UI (version buttons, sliders, camera, defaults) is in `ui.js`.
