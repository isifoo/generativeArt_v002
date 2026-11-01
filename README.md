# Generative Art v002

Versions (each one is a button): V1 Line (WebGPU, from generativeArt_v001), Ishihara (packed circles, Canvas 2D) and Depth (Depth Anything V2 Small depth map, WebGL2 look).

- Live: https://isifoo.github.io/generativeArt_v002/
- Settings button opens the slider panel. Every slider has a max field and a -1 on/off box.
- The sim pauses while a slider is dragged and catches up 0.25 s after release.
- New slider: one entry in `SLIDERS` in `line.js`.
- Local: `python -m http.server` in this folder, open http://localhost:8000/ (`?nocam` skips the camera).
- Ishihara: `?view=ishihara`. Video -> base tone (levels clip, local contrast, brightness). Three drivers read it, each with its own contrast slider: Value (dark / light, contrast, range), Hue (figure hue vs ground hue, split, saturation), Size (darkness, detail, size contrast, randomness), Spacing (gap px, gap by darkness, fill holes: circles squeeze into free room so hardly any paper shows). Motion includes a subtle wiggle (px, speed), drawn only. Motion sliders set colour ease, size ease, repack speed, tone smoothing and the change threshold. Circles never overlap (Pastiche-style packing). Edit > Preview shows the colour map.
- Colour system (every style): the palette lives as CSS variables in `css/main.css` (`--colors`, `--c1` dark, `--c2` middle, `--c3` light, `--paper`). Edit > Colours writes them (`palette.js`); every engine reads them with `getPalette()` / `onPalette()` from `ui.js`. A new style only needs to read the palette. The editor is a colour wheel after color.adobe.com (`colorwheel.js`): artist's RYB wheel, 2 or 3 colours (dark areas, middle, light areas), harmony icon buttons (custom, analogous, complementary, split complementary, triad, square, compound, shades, monochromatic): dragging the main point keeps the relationship, dragging another point breaks it (Custom), brightness, hex fields, paper colour. Presets load into the wheel.
- Main page: the portrait centred, style buttons + Edit below. Edit slides the panel in from the right and the portrait glides to the left.
- Shared UI (version buttons, sliders, camera, defaults) is in `ui.js`.
- Depth: `?view=depth`. Depth Anything V2 Small (fp16 ONNX, `vendor/`, onnxruntime-web on WebGPU, WASM fallback). After the model: near / far percentile range with slow follow, time smoothing, shape detail (edge-aware local depth contrast, no halos), joint bilateral upsampling guided by the video (edges follow real outlines), video detail, depth curve, contrast, colour steps; grey or the palette.
- Owner PIN: Set default / Reset defaults / Copy settings are hidden. Click the version line under the buttons and type the PIN (remembered on that device; click the line again to lock). Saved defaults live in that browser. `site-defaults.json` (optional, same shape as Copy settings) gives every visitor the defaults.
