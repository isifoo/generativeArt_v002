# Generative Art v002

V1 Line only (WebGPU), cleaned up from generativeArt_v001.

- Live: https://isifoo.github.io/generativeArt_v002/
- Settings button opens the slider panel. Every slider has a max field and a -1 on/off box.
- The sim pauses while a slider is dragged and catches up 0.25 s after release.
- New slider: one entry in `SLIDERS` in `line.js`.
- Local: `python -m http.server` in this folder, open http://localhost:8000/ (`?nocam` skips the camera).
