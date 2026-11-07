# Generative Art v002

Versions (each one is a button): V1 Line (WebGPU, from generativeArt_v001), Ishihara (packed circles, Canvas 2D), Depth (depth map, WebGL2 look), Depth Dots (the Ishihara packing driven by the depth map) Depth 3D (the depth map as a lit 3D surface, three.js) Dollar (banknote engraving, one pixel shader) Dollar 2 (engraving from the engraver's procedure: clean tone, smooth direction field, evenly spaced streamlines) Dollar 3 (V1's growing line, thinner and calmer, with dash levels) and Dollar 4 (was Fractal Lines: node based line levels on a 6-level luma map) and Dollar 5 (Dollar 4 with the depth map as the matte).

- Live: https://isifoo.github.io/generativeArt_v002/
- Settings button opens the slider panel. Every slider has a max field and a -1 on/off box.
- The sim pauses while a slider is dragged and catches up 0.25 s after release.
- New slider: one entry in `SLIDERS` in `line.js`.
- Local: `python -m http.server` in this folder, open http://localhost:8000/ (`?nocam` skips the camera).
- Ishihara: `?view=ishihara`. Video -> base tone (levels clip, local contrast, brightness). Three drivers read it, each with its own contrast slider: Value (dark / light, contrast, range), Hue (figure hue vs ground hue, split, saturation), Size (darkness, detail, size contrast, randomness), Spacing (gap px, gap by darkness, fill holes: circles squeeze into free room so hardly any paper shows). Motion includes a subtle wiggle (px, speed), drawn only. Motion sliders set colour ease, size ease, repack speed, tone smoothing and the change threshold. Circles never overlap (Pastiche-style packing). Edit > Preview shows the colour map.
- Colour system (every style): the palette lives as CSS variables in `css/main.css` (`--colors`, `--c1` dark, `--c2` middle, `--c3` light, `--paper`). Edit > Colours writes them (`palette.js`); every engine reads them with `getPalette()` / `onPalette()` from `ui.js`. A new style only needs to read the palette. The editor is a colour wheel after color.adobe.com (`colorwheel.js`): artist's RYB wheel, 2 or 3 colours (dark areas, middle, light areas), harmony icon buttons (custom, analogous, complementary, split complementary, triad, square, compound, shades, monochromatic): dragging the main point keeps the relationship, dragging another point breaks it (Custom), brightness, hex fields, paper colour. Presets load into the wheel.
- Main page: the portrait centred, style buttons + Edit below. Edit slides the panel in from the right and the portrait glides to the left.
- Shared UI (version buttons, sliders, camera, defaults) is in `ui.js`.
- Depth: `?view=depth`. Depth Anything V2 Small (fp16 ONNX, `vendor/`, onnxruntime-web on WebGPU, WASM fallback). Optional second model (`depth_anything_v1_small_fp16.onnx` in `vendor/`, used if present): runs on the same frame, is fitted (scale + offset) to the first and averaged in. After the model(s): near / far percentile range with slow follow, motion-aware time smoothing (still spots smooth hard, moving spots follow), a crossfade between consecutive maps on the GPU, shape detail (edge-aware local depth contrast, no halos), joint bilateral upsampling guided by the video (edges follow real outlines), video detail, depth curve, contrast, colour steps; grey or the palette.
- Owner PIN: Set default / Reset defaults / Copy settings are hidden. Tap Owner at the bottom of Edit (or click the version line under the buttons) and type the PIN; Lock hides them again (remembered on that device; click the line again to lock). Saved defaults live in that browser. `site-defaults.json` (optional, same shape as Copy settings) gives every visitor the defaults.
- Depth model code is shared: `depthmodel.js` (`createDepthModel(opt, onMap)`), used by Depth and Depth Dots.
- Depth Dots: `?view=depthdots`, runs in `ishihara.js` with the depth map as the field. Edit > Depth drives: Size (one colour, the dark colour; near = big) or Colour (palette by depth; random sizes). No wiggle; circles settle 1.5 s after a change and then stay still (no repacking churn, no new filler dots).
- Depth 3D: `?view=depth3d` (`depth3d.js`, three.js 0.160 from jsdelivr via the importmap in `index.html`). A grid mesh pushed by depth (blended between depth maps, edge-keeping surface smoothing), key light + hemisphere fill + RoomEnvironment reflections, ACES tone mapping. Looks: video on the surface, white clay, palette by depth. Cut edges (off by default) removes cells across big depth jumps. Camera: turn, tilt, zoom, sway; drag to turn, double click to reset.
- Dollar: `?view=dollar` (`engrave.js`), tuned on a close-up of the $100 portrait (one spacing and one line thickness everywhere; contrast in levels: short dashes, longer dashes, continuous lines, cross lines, cross lines with dots in the lozenges; directions from depth: a structure tensor of the depth map gives the contour direction, line sets every 'direction step' degrees, each spot draws the nearest set, soft region edges; one depth model only). The engraver's rules as math, in one WebGL2 fragment shader: line families as phase fields (distance to the nearest line in px from |fract(phi+.5)-.5| / |grad phi|), tone = ink coverage of the line spacing (lines wider than the gaps leave white lines on black: the inversion happens by itself), layers (one family, crossing family from a tone, third family in the darkest), depth bends the lines around forms and splits subject / background (background: straight horizontal lines at their own spacing), dashes and dots in the light tones, a dot in each lozenge in the mid tones, wobble + ink bleed + per-line weight variety, outline at depth jumps, hairline minimum. Inputs: a tone map (CPU, 270 x 480) and the depth map. Ink = palette dark colour, paper = palette paper.
- Dollar 2: `?view=dollar2` (`engrave2.js`). 1 black ink on white (palette optional), 2 clean tone (levels, contrast, two rounds of separable bilateral smoothing, soft tone bands, time smoothing), 3 a smooth direction field from structure tensors of depth (one model) and tone, heavily smoothed, base angle where flat, 4 evenly spaced streamlines (Jobard-Lefer: seeds one spacing from placed lines, stop at 0.75 spacing), a second set rotated by the cross angle, tapered ends, 5 tone on the lines at one thickness (dashes -> lines -> crossing set). Lines rebuilt every second (cross-fade), tone updates every frame. Overlay: Dollar's engraving shader runs as a layer on top (`window.__dollarOverlay`, multiply blend, shared video + depth model, its sliders under 'Overlay Dollar' headings, Overlay strength).
- Dollar 3: `?view=dollar3`, runs in `line.js` (V1's engine) with its own sliders: spacing carries the contrast (Rmin / Rmax), calmer curves (Straightening = tension, Random push, New point jitter, Spacing noise, extra Smoothing passes), thin stroke, and tone levels on the line: dashes in the lights (fixed in space so they don't crawl), longer in the mids, continuous from a darkness. Black on white unless 'use the palette'. `?warm=` lowers the warm-up steps for slow GPUs.
- Fractal Lines: `?view=flines` (`lines.js`), node based: up to 6 levels (Level01..06), each [Lines] (procedural pure sine lines shifted by the master spacing; Width, Angle, Dash length, Dash gap, and a "Shift half a spacing" checkbox that moves the lines exactly between their original positions) + [Alpha] (AE Extract on the smoothed luminance + six grey level channels 0-5 as the matte) -> [LevelNN]; all levels -> [Master] (universal values as CSS variables on :root, e.g. --spacing, read by every node with master(name); output = levels stacked like ink). + Duplicate level copies the last level. Click a node: Edit shows only its sliders. One shader pass draws all levels. Speed (v2.14): drawn at the size it is shown (at most 1080 wide), at most 30 frames a second, levels skipped where their matte is empty, uniforms uploaded only when a setting changes, node thumbnails refreshed only when something changed (about 3 a second) in the same frame as the picture, wires redrawn only when the panel moves. The Edit panel's stats show the measured frames per second and CPU time.
- Slider groups fold like After Effects twirl-downs (click a group heading); the Colours section folds too (closed by default). Folds are remembered per style.
- Dollar 1: `?view=dollar1`, runs in `engrave2.js` showing only the Dollar overlay layer (Overlay strength 0.6, multiply on white), without Dollar 2's lines; own defaults.


## Settings files (v2.14)
Edit > Save file downloads every setting of the current style (sliders, max values, on/off boxes, Fractal Lines levels, channel mattes, master values, colours) as a .json. Load file brings one back. Anyone can use these; Save as default (PIN) still sets what the page opens with.

## Autosave (v2.16)
Every change is saved in this browser automatically (once a second, and when the page is closed or hidden), separately for each style, and comes back on refresh. Edit > Start over forgets it and goes back to the defaults. It lives in this browser only: use Save file to move a setup to another device.

## Fractal Lines Overlay node (v2.17)
An [Overlay] node feeds the Master: the Dollar engraving (engrave.js in overlay mode, the soft and detailed v2.02 look of Dollar 1: levels clip 2, local contrast 1.65, contrast 1.1, brightness 0.13, depth detail 22, smoothing 0.85) multiplied on top at Strength 0.6. Its panel shows Strength, Depth detail, Depth smoothing and the engraving tone group only. The depth model loads only when the overlay is on; at Strength off nothing runs.

## Solo and hide (v2.18)
Every Fractal Lines node (Lines, Alpha, LevelNN, Overlay) has Solo and Hide buttons under its title (solo: the stage shows only that node; one at a time; click again to leave) and H (hide: Lines or the level hidden = the level is left out; Alpha hidden = no matte; Overlay hidden = off and not computed). Hides are saved with the setup; solo is a viewing tool and is not saved.

## Presets (v2.19)
Edit > Presets loads a ready-made look from presets/ (presets/index.json lists them per style); only the settings it names change. Fractal Lines "Five levels" (also the site default, site-defaults.json): channel 5 = darkest. L1 width 3, angle -6, continuous, channels 4-5; L2 same at 24 deg (30 deg turn), 4-5; L3 width 1.6, -6, dashes 24/8, 2-3; L4 width 1.6, 24 deg, dashes 14/22, 0-1; L5 width 1.4, dots 2.5/6 shifted half a spacing (between the lines), 0-1. The Overlay is left as it is.

## Channel labels (v2.20)
The Levels-as-matte buttons read 0 = darkest .. 5 = lightest, left to right. Only the labels changed: stored values (l{k}ch) keep the internal index (5 = darkest), so saved setups, files and presets are unchanged. In those labels the Five levels preset is: L1, L2 on 0-1; L3 on 2-3; L4, L5 on 4-5.

## Studio layout and AE solo / hide (v2.22)
Fractal Lines: nodes on the left (the graph scales to fit), the picture always centred, the settings always open on the right; phones stack picture, nodes, settings. Solo / Hide work like After Effects: several nodes can be soloed at once (the Master shows only them, each as itself: Lines = lines alone, Alpha = the matte, Level = lines x matte, Overlay); Hide always wins, also over Solo; wires from hidden nodes are dashed; removing a level clears its solo. Tested with pixel comparisons (drift frozen): 29 checks.

## Black on white, Multiply, channels only (v2.23)
Every level is pure black lines on pure white; the Master multiplies the layers (like Multiply in After Effects; the overlay multiplies on top). Lines are drawn at their full Width wherever the level's channels let them through: the luma no longer thins them, so every channel 0-5 draws at the same density (measured: 20.8-21.5% ink inside each channel for width 3 / spacing 15). Multiply measured exact (composite = product of the soloed levels, within rounding).

## Opaque channels, click to solo (v2.24)
The matte is six fully opaque levels: a channel is on (100%) or off (0%); no channel chosen = on everywhere (the old grey ramp is gone). Clicking a node solos it and opens its settings; clicking it again turns solo off; clicking another node solos that one instead; clicking Master shows the full picture. The Solo buttons still solo several nodes at once.

## Motion (v2.25)
Master > Motion speed (universal, CSS variable --motion), default 0 = still. With motion 0 the picture is redrawn only when something changes (a video frame, a setting, solo / hide), so an idle page does no drawing work.

## Map node (v2.26)
One [Map] node holds the 6-level map every Alpha reads: luma -> Black point / White point -> Smoothness (px) -> six bands (0 darkest .. 5 lightest), with Softness (% of a band at each on/off edge). Click Map to see its six greys. Each Alpha keeps its channels and Invert, plus Softness (own), off by default = the Map's softness; tick its box to override for that layer. The per-layer Black / White point and softness sliders are gone (they did nothing with channels on).

## Dollar 4 and Dollar 5 (v2.27)
Fractal Lines is renamed Dollar 4 (still ?view=flines, so saved setups and presets keep working). Dollar 5 (?view=dollar5) is the same engine (lines.js, D5 flag) with the Depth style's depth map as the Map (near = white, far = black; Depth detail, Depth smoothing and Smoothness on the Map node; one depth model shared with the Overlay). Each layer's Alpha is an AE Extract on the depth map: Black point, White point, Black softness, White softness, sliding over the whole 0-255 range. No Invert, no channel buttons.

## Rough edges and Flip (v2.28)
Each Lines node: Rough edges px (default 0.8; 0 = clean), the stroke edges and dash ends wander like ink on paper (two scales of value noise fixed to the paper). Flip node (Dollar 4 and 5): the map cut into Bands (2-6, default 4; -1 box = off); at every band edge the sine breaks and flips direction, for every level. Click Flip to see its bands (white = one way, black = flipped).

## Flip by detail (v2.29)
The Flip node now reads the image details, not bands of the map: detail = 0.5 + Detail contrast x (fine luma - luma blurred at Detail size px). Darker-than-around details (band 0, then every other band) flip: the wave turns over, the lines turn by Turn deg (default 45), and with Cross (default on) the turned lines are added to the first set, so dark details are cross-hatched. Defaults: Bands 2, Detail size 90 px, Detail contrast 4.5, Turn 45, Cross on.

## Overlay Levels, Flip threshold (v2.30)
The overlay engraving was measured unchanged since v2.17 (mean difference 0.002/255); the extra noise came from the layers under it. Overlay node: Black point / White point (AE Levels on the layer, as a CSS filter; default white 225 turns the light-grey speckle into paper). Flip node: Detail threshold (default 0.12): only details clearly darker than their surroundings cross-hatch.

## Overlay rebuilt (v2.31)
The overlay is no longer the engraving (engrave.js) with its own depth model. It is drawn in the same shader pass, from the camera: greyscale (540 x 960 texture, mipmapped) -> difference of blurs (a spot darker than its surroundings at Feature size) -> soft threshold, plus Solid blacks for the deepest darks; black on white, multiplied on top. Overlay node: Strength 0.9, Feature size 20 px, Contrast 22, Threshold 0.3, Softness 0.45, Solid blacks 0.18. Dollar 4 no longer loads a depth model at all.

## Track mattes (v2.32)
Each Alpha has a Track matte (like After Effects): source None / Overlay / another Level (its lines through its own matte), and which part: where it has ink, or where it is white. It multiplies with the layer's own matte (channels / Extract); leave the channels empty to use only the track matte. The Overlay works as a matte while hidden. Connect by dragging from the Overlay or a Level node onto an Alpha (same drag again = disconnect), or in the Alpha's panel; connections show as green dashed wires. Alpha thumbnails are drawn by the shader and include the track matte.

## One matte per Alpha (v2.33)
Simpler: each Alpha has one Matte menu: Map (channels / Extract, as before), Flip (the Flip node's darker details), Overlay (the face features). The two-menu track matte and level-as-matte are gone (an old saved level-matte reads as Map). Drag the Flip or Overlay node onto an Alpha to choose it (again = back to Map); green wires show it; the Map's own settings dim when another matte is used. The camera texture is always updated, so the Overlay works as a matte, thumbnail and solo while hidden.

## v2.34: cleanup and Lines V2
Removed: Dollar, Dollar 1, Dollar 2, Dollar 3 and Dollar 4 (engrave.js and engrave2.js deleted; the Dollar 4 preset and site default removed; old links fall back to V1 Line). Dollar 5 stays (lines.js). New: Lines V2 (?view=linesv2, linesv2.js): horizontal lines that all carry the same sine, y + Amplitude x sin(2 pi Frequency x / width); sliders Frequency (waves across), Amplitude px, Spacing px, Width px, Motion speed (0 = still). One pixel shader with the exact distance to the nearest line; draws only when something changes.

## The -1 box mirrors the range (v2.35)
Every slider: the number field sets the max; the -1 box (off by default) mirrors the range to -max .. max (e.g. Amplitude -1000 .. 1000: negative = the wave the other way). Off: the slider's own min .. max. Sliders are never switched off any more; where off meant something it is now a value: Dollar 5 Flip Bands 0 = no flip, Dash length 0 = continuous, Overlay Strength 0 = off; Depth Colour steps 0 = continuous; Depth 3D Cut edges 0 = no cut. Saved setups store "neg"; old saves never turn the mirror on.

## Cache fix (v2.36)
The shared modules (ui.js, palette.js, colorwheel.js, depthmodel.js) are version-stamped through the import map in index.html (the build stamp is replaced with the others on each version), so a browser can no longer keep running an old ui.js under a new page (that is why v2.35 still showed the old -1 box).

## Lines V2 on the nodes (v2.37)
Lines V2 now runs on the Dollar 5 engine (lines.js, V2 flag; linesv2.js deleted): Lines > Alpha > LevelNN > Master, Duplicate level, Solo / Hide, Depth map + Extract per Alpha, Flip, Overlay, Matte menu. Each Lines node has Frequency (waves across) and Amplitude px, plus Width, Angle, Dash length, Dash gap, Rough edges. Starts as clean horizontal sine lines (angle 0, no dashes, no rough, Flip 0, Overlay 0); draws without waiting for the camera; the depth model loads only once an Extract is narrowed or the Depth map is soloed. Fix: Flip Bands 0 no longer flips everything (since v2.29).

## Hope and Blend (v2.38, Dollar 5 and Lines V2)
Hope node: a clean poster shading map (like the Obama Hope poster). The depth map (ML) is lit by a virtual lamp (surface normals from the depth x light direction), a little smoothed photo brightness is mixed in, auto levels, then cut into Levels (2-6) with anti-aliased flat edges. Settings: Levels, Light angle, Light height, Relief, Photo mix, Smoothness, Edge softness; Update: Realtime (smoothed in time) or 2 per second (each new map crossfades in over half a second). Blend node: the Overlay (features, black on white) and the depth map in a blend mode (Multiply, Screen, Overlay, Soft light, Darken, Lighten, Difference) with Mix. Both are Matte choices on every Alpha; the Alpha's Extract then picks which part of the map (e.g. the two darkest Hope tones). Drag the Hope or Blend node onto an Alpha to connect.

## Live strokes (v2.41, Dollar 5 and Lines V2)
The Overlay can now be drawn as long, evenly spaced brush strokes (Overlay 016 from the Overlay Lab, as in Motion Lab 007) that follow the face and redraw a few times a second from the live camera.
- **Where:** Overlay settings, `Live strokes (1 = brush strokes)` (default 0) and `Strokes per second` (default 8). The Overlay Strength still sets how strong the overlay is (Lines V2 starts at 0).
- **How:** `strokes-worker.js` (a Web Worker, so the picture stays smooth) turns the camera picture into the detector's ink, makes a direction field (structure tensor, slow eddies, whirls at the dark features), traces evenly spaced streamlines seeded from the previous frame's strokes carried by optical flow (Lucas-Kanade at 1/8 size), and sets each stroke's width from the darkness under it. The GPU draws the strokes as triangle strips into a 1080 x 1920 texture and the Overlay reads that texture.
- **Speed (measured in Node, one camera frame):** about 135 to 175 ms per trace, so roughly 6 to 7 traces a second at most on that machine; the setting above is a ceiling. The Stats panel shows the real time per trace.
- **Not in this version:** the eyes redrawn from face detection (Overlay Lab 024/025), and the stroke stabilising between frames beyond the flow seeding.

## Live strokes: easier to switch on (v2.42)
Setting `Live strokes` to 1 now also raises the Overlay Strength to 1 if it was 0. Opening `?view=linesv2&strokes=1` starts Lines V2 with the live strokes on and only the Overlay showing (soloed); click the Master node to see everything again.

## One overlay, calmer Hope (v2.43)

- Lines V2: the brush-stroke overlay is now the only Overlay. The old feature sliders and the "Live strokes" switch are gone; Strength (default 1) and Strokes per second remain. Other views keep the old overlay.
- Hope: defaults changed to Photo mix 0.85, Relief 1.5, Smoothness 24. The depth model's noise was lit by a strong lamp (Relief 6) and turned the flat areas into mottled noise once the depth map arrived.

## Overlay matte = the brush strokes (v2.44)

- Lines V2: an Alpha whose Matte is "Overlay" now always gets the brush strokes (Motion 007), also when that Alpha is soloed or the Overlay node is hidden. Before, the strokes were only traced while the Overlay node itself was showing, so the Alpha got the old feature detector.

## Clean strokes (v2.45)

- The brush-stroke overlay now draws clean, evenly spaced lines: wider spacing (4.5 px of the 540 px trace), a much smoother direction field, almost no curl noise, no vortices, thicker lines in the dark. The busy look is still there as `?look=dense`.

## Engraving look: cross-hatching (v2.46)

- The brush-stroke overlay now looks like a banknote engraving: thin evenly spaced lines whose weight follows the picture's tone (auto-levelled), a second set of lines crossing at 58 degrees in the darker areas and a third at minus 58 degrees in the darkest, so the shadows become a woven mesh and the highlights stay open. Highlight lines break into short dashes.
- Cost: about 200 to 270 ms per trace in Node (measured), so roughly 4 traces per second, down from about 7.
- Looks: `?look=hatch` (default), `?look=clean` (v2.45, one set of even lines), `?look=dense` (Motion 007).

## Finer engraving (v2.47)

- Hatch look: lines 30 percent closer (2.3 px of the 540 px trace), thinner, and a broad second direction field so flat areas follow the big tonal contours instead of forming blocky patches. Measured in Node: 270 to 345 ms per trace, about 3 traces a second.

## Engraving from the depth map (v2.48)

- New default Overlay look in Lines V2: engraver's lines drawn by a shader. Three sets of lines are contours of the depth map cut by tilted planes, so they bend over the face the way a banknote engraver's do; the tone sets the line weight, and the second and third sets cross the first only in the darker areas. No tracing, so it runs at the full frame rate and is steady between frames. It needs the depth model, which loads when the Overlay (or an Alpha with Matte Overlay) is used.
- `?look=hatch` | `clean` | `dense` bring back the traced brush strokes (worker) of v2.46, v2.45 and v2.41.
- Lines can look busy (moire) when the picture is shown smaller than its 1080 px; the depth contours wobble where the depth model is noisy.

## Windows (v2.49)

- New version button **Windows** (`?view=windows`, `windows.js`): a night apartment block drawn by the GPU, and the person is made of the windows with their light on. The camera picture is read one window at a time; the depth model finds the person (near = lit), and the tone inside carves the face (eyes and shadows stay dark). Each window has its own fixed random switch-on level, so the portrait is a dither of lit windows; time smoothing keeps them from flickering. A few random lights elsewhere keep the block alive.
- Settings: windows across, window height / width, person edge, face detail, threshold, contrast, random spread, lights elsewhere, invert, time smoothing, warm / cool, glow, facade brightness.
- Needs the depth model (loads on start, like Depth). Tested on a recorded clip only, not a live camera.

## Windows on a photographed block (v2.50)

- The Windows view now uses a generated night photograph of an apartment block (`windows/bg.webp`, 768 x 1376) instead of a drawn facade. The window positions were found once offline (18 columns by 31 rows, 510 windows; the lattice was fitted to the detected windows and each cell takes the detected window or a typical one); `windows/win.json` lists them and `windows/id.png` marks which window every pixel belongs to. Windows that were lit in the photograph were swapped for dark ones from the same building.
- Each frame, the person (depth model) and the tone inside the person decide a light level for every window; the shader fills lit windows with warm or cool light, keeps frames and bars as dark silhouettes, and adds a halo on the wall.
- The offline step is `camera-motion/win/build.py` (local, not in the repo). Replacing the picture means re-running it.
- Tested on a recorded clip only.

## Real window textures and layered glow (v2.51)

- A lit window now shows the texture of a real lit window: the 39 windows of the photograph that were drawn with their light on are kept as small textures (`windows/atlas.png`: curtains, frames, mullions, the fall of the light), and every lit window takes one of them (picked and flipped by its own number), mapped exactly onto that window's rectangle (`rectT`) and tinted warm or cool. Frames and bars stay dark against the light.
- Glow is a separate layer: the light of the windows is drawn alone, blurred in three levels (about 8, 32 and 64 px at output size, each a down-sample plus a horizontal and a vertical pass) and added back. Settings: Glow and Glow spread (tight to wide).

## Windows: new building, light from the camera's brightness (v2.52)

- New, higher resolution block (`windows/bg.webp`, 1024 x 2000): 28 columns by 50 rows, 1,400 windows found offline. The picture is shown at its own proportions and the canvas is drawn at its full size.
- Each window's light is a solid yellow laid over that window's own area in Screen mode (frames and curtains of the photograph stay visible). The brightness of the camera under the window sets its strength: dark gives a dim light, bright a strong one. Auto levels follow the person's brightness range (4 % to 96 %); Black point, White point, a contrast curve, Light strength and a small variation per window are the controls. The depth model fades the background so the person stands out (Fade the background).
- Glow stays a separate layer in three blur levels. The lit windows of the photograph were put out as before. The older texture-per-window version (v2.51) is replaced.

## Letters, and the palette back in every style (v2.53)

- New version button **Letters** (`?view=letters`, `letters.js`), after the Coinbase / Buck piece: the camera picture drawn as characters on a grid, white symbols on one saturated colour. The brightness under each character picks a symbol from a ramp (default `.-+=<0#1&$`; also dollars, classic ASCII, code symbols, digits, binary, letters); symbols can shimmer to a neighbour of the ramp, and faint symbols fill the empty ground. Glyphs are drawn once into an atlas with the browser's monospace font and picked in the shader. Settings: characters across, character height, symbol size, auto levels or black / white point, contrast, invert, time smoothing, optional depth fade of the background, shimmer, ground symbols, symbol weight.
- The universal palette (Edit > Colours, the wheel) was only read by V1 Line, Ishihara, Depth, Depth Dots and Depth 3D. It is now read by every style: Lines V2 / Dollar 5 draw the dark colour as ink on the paper colour (Master > Palette colours; the node thumbnails stay plain greys), Windows takes its lights from the palette (Light colours from the palette), Letters uses dark = background, light colours = symbols, paper = brightest symbols.
- Two new presets: Electric blue and white (set the first time Letters is opened) and Night windows, yellow lights (set the first time Windows is opened). After that the palette is yours.

## One menu, Camera style, Record, frontal Depth 3D (v2.54)

- One dropdown replaces the row of style buttons (next to Edit and Record). Each style still loads as its own page (`?view=`); the camera comes back at once.
- New style **Camera** (`camera.js`): just the camera in real time, with a light grade (brightness, contrast, saturation, gamma, zoom, shift, and a palette duotone). It is the clean base for recording.
- **Record** button next to Edit, in every style: records the picture as it plays (real time) and saves an MP4 (WebM where the browser has no MP4 recorder). The recorder copies the canvas into its own 2D canvas every frame and records that, because recording a WebGL canvas directly came out empty. Lines V2 / Dollar 5 now keep their drawing buffer so they can be copied. Tested saving a non-empty file in Letters; the other styles and playback were not checked.
- Depth 3D: the view is frontal (Turn, Tilt and Sway default to 0, dragging no longer orbits) and the depth amount default is 0.3 (was 0.9), so a person is not stretched back toward the wall.
