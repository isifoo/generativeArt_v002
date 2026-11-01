# Generative Art v002

Versions (each one is a button): V1 Line (WebGPU, from generativeArt_v001) and Ishihara (packed circles, Canvas 2D).

- Live: https://isifoo.github.io/generativeArt_v002/
- Settings button opens the slider panel. Every slider has a max field and a -1 on/off box.
- The sim pauses while a slider is dragged and catches up 0.25 s after release.
- New slider: one entry in `SLIDERS` in `line.js`.
- Local: `python -m http.server` in this folder, open http://localhost:8000/ (`?nocam` skips the camera).
- Ishihara: `?view=ishihara`. Video -> base tone (levels clip, local contrast, brightness). Three drivers read it, each with its own contrast slider: Value (dark / light, contrast, range), Hue (figure hue vs ground hue, split, saturation), Size (darkness, detail, size contrast, randomness), Spacing (gap px, gap by darkness, fill holes: circles squeeze into free room so hardly any paper shows). Motion includes a subtle wiggle (px, speed), drawn only. Motion sliders set colour ease, size ease, repack speed, tone smoothing and the change threshold. Circles never overlap (Pastiche-style packing). Edit > Preview shows the colour map.
- Ishihara colours: Edit > Colours is a colour wheel after color.adobe.com (`colorwheel.js`): artist's RYB wheel, 2 or 3 colours (dark areas, middle, light areas), harmony rules (analogous, monochromatic, triad, complementary, split complementary, square, compound, shades, custom), brightness, hex fields, paper colour. Presets load into the wheel.
- Main page: the portrait centred, style buttons + Edit below. Edit slides the panel in from the right and the portrait glides to the left.
- Shared UI (version buttons, sliders, camera, defaults) is in `ui.js`.
