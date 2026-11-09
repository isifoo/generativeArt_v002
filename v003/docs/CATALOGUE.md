# Catalogue: every module made so far, broken into nodes (draft 1)

Source: the v002 app (257 sliders across 12 engine files, full list in `params_inventory_v002.json`). This page is the proposed node library. "Core params" are the few sliders each node should keep; everything else is dropped until it is shown to change the picture.
Status key: V = visual effect seen by me in a test, T = still to test in the node build, X = drop (camera angle / sway / no seen effect).

## Types of data (the ports)
Image (RGBA or grey), Mask (0..1), Field (a number per pixel, e.g. density), Path (one or many polylines), Points (positions + size + colour), Colour (palette), Curve (a response curve).

## 1. Sources
| Node | Out | Core params | From | Status |
|---|---|---|---|---|
| Camera / Video | Image | mirror, speed | ui.js, camera.js | V |
| Test picture | Image | none | line3lab | V |
| Depth | Field (near = 1) | model detail, near clip, far clip, steadiness (maps per second) | depthmodel.js, depth.js | T (crash on low power devices, see handoff) |
| Subject matte | Mask | threshold, softness | line.js segmenter, depth | T |

## 2. Image tools (tone, matte, distortion)
| Node | In > Out | Core params | From | Status |
|---|---|---|---|---|
| Levels / Contrast | Image > Image | black, white, gamma, auto levels | letters (lblk lwht lgam), ishihara (ihlo ihl) | V |
| Invert | Image/Field > same | on/off | many (linv, dinv, l3inv) | V |
| Time smooth (ease) | any > same | ease seconds | all styles (lsm, ihf, l3e) | V |
| Blur | Image > Image | radius | glow in dots | T |
| Edge detect | Image > Field + angle | threshold, thickness, softness | letters_v02 (ledge ledgew ledgs) | V |
| Track matte | Image + Mask > Image | mode (alpha, luma, inverted), softness | Subject only / Red key in line.js | T |
| Displacement map | Image + Field > Image | amount, direction | none yet (new, as in AE) | T new |
| Tone to Field (density driver, part 1) | Image > Field | contrast curve, brightness | line3 (l3con l3th), line (con bri) | V |
| Field range (density driver, part 2) | Field > Field | min gap, max gap | line3 (l3min l3max), line (rmin rmax) | V |

## 3. Line generators (out: Path)
| Node | In | Core params | From | Status |
|---|---|---|---|---|
| Serpentine (phase field) | density Field | run length, turn softness, line count follows density | line3.js | V |
| Meander (square wave scanline) | density Field | rows, run length (spline), wave height, **angle** | line3lab c5 | V |
| Peano / Hilbert | density Field | coarsest level, detail curve | line3lab c2, c6, c7 | V |
| Ring simulation (Line_v01) | density Field | stroke, spacing range, gain | line.js (WebGPU compute) | V, heavy |
| Square corners | Path > Path | strength | LineSquare in line.js | V |
Rule from Gerry: default result is long straight runs with sharp turns; the user bends it by changing the curve node.

## 4. Path operations (in: Path, out: Path)
Rotate (angle), Straighten (tension), Smooth (passes), Jitter (random push), Wave (height, length), Simulate (relax steps), Curve shape (spline controlling run length or turn). Mostly new as separate nodes; the maths exists in line.js and line3.js. Status T.

## 5. Draw nodes (in: Path / Points / Field + Colour, out: Image)
| Node | Core params | From | Status |
|---|---|---|---|
| Stroke | width, ink colour | line3.js, line.js | V |
| Dots (drones) | count across, size, brightness, glow | dots.js, dotsv02.js | V (3D sway controls dropped) |
| Face detail dots | extra % on details, threshold | dotsv02.js | V |
| Circles packing (Ishihara) | min / max size, size contrast, gap | ishihara.js | V |
| Letters grid | characters across, symbol set, weight, shimmer | letters.js | V |
| Edge line glyphs | uses the Edge detect node, fill % | letters.js (v02) | V |
| Windows (night facade) | light strength, ambient %, glow | windows.js | T |
| Dollar / Lines V2 layers | spacing, map, flip, hope, overlay | lines.js (31 sliders) | T, probably split or dropped |

## 6. Finishing
Palette (global, Adobe style, existing palette.js, stays as is), Glow (strength, spread), Echo (count, time, decay, mode), Grade (brightness, contrast, saturation), Output (screen, record).

## 7. Dropped on purpose
Turn / tilt / sway / camera angle and perspective controls (dots, depth, depth3d), the 3D depth surface light and material set (depth3d.js, 23 sliders) until a node case is made for it, duplicate depth-model sliders repeated in every style (one Depth node replaces them).

## Counting
257 sliders today. The node library above keeps roughly 60 core params; everything else is dropped or folded into the cogwheel drawer. This is a draft: parameters are confirmed one by one when each node is built and tested.
