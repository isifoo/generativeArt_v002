# Generative Art v002: handoff (2026-11-03, after v2.38)

Read this first in a new chat. It covers what exists, how to work with Gerry, and what is in progress.

## The project
- Live site: https://isifoo.github.io/generativeArt_v002/
- Repo: isifoo/generativeArt_v002. Branch `main`; GitHub Pages serves `gh-pages`, which mirrors `main`.
- Current version: **v2.38** (build `20261103140000`).
- Styles (buttons): V1 Line (`line.js`, WebGPU), Ishihara and Depth Dots (`ishihara.js`), Depth (`depth.js`), Depth 3D (`depth3d.js`), **Dollar 5** (`lines.js`, view `dollar5`), **Lines V2** (`lines.js`, view `linesv2`).
- Removed in v2.34: Dollar, Dollar 1-4 (engrave.js and engrave2.js deleted; they are in git history). Old links fall back to V1 Line.
- `README.md` has a section for every version: what changed and why.

## How to work with Gerry
- Short replies: a one-line summary first, then the details. No em dashes.
- Say what was measured and what is estimated.
- Ask scoping questions before big builds.
- **Ask before downloading anything**: give the name, source and size.
- Every version is a button, and every page shows its version.
- Test before handing over a version, and report results honestly.
- Keep sliders few.
- He works on PC and iPhone and thinks in After Effects and Houdini terms: nodes, solo/hide, track mattes, Extract, blend modes.
- The owner PIN (Gerry knows it; only its hash is in the code) unlocks Set default / Reset / Copy settings.
- Don't touch gerryrufman.com or the gerryrufman-site repo.
- Don't put model identifiers in commits or files.

## Deploy routine
1. In `index.html`, bump the build stamp. It appears 3 times: the meta tag, the stylesheet query and the import map. Use one `sed -i 's/OLD/NEW/g'`. Also update the version line, e.g. `v2.38 (2026-11-03)`.
2. Write `version.json` as `{"build":"NEW","version":"v2.NN"}`.
3. Add a section to `README.md`.
4. Commit as user.name `isifoo`, user.email `gerryrufman@gmail.com`, with these trailer lines:
   - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   - `Claude-Session: <session url>`
5. Run `git push origin main` and `git push origin main:gh-pages`.
6. Poll `https://isifoo.github.io/generativeArt_v002/version.json` until the new version string shows (about 1 minute).
- **Cache:** shared modules (`ui.js`, `palette.js`, `colorwheel.js`, `depthmodel.js`) are stamped through the import map in `index.html`. Style modules are stamped through the dynamic import (`?b=`). If you add a new shared module, add it to the import map.

## The node engine (`lines.js`): Dollar 5 and Lines V2
- **Layout:** studio layout, with nodes on the left, the picture in the centre and settings on the right. On phones they stack.
- **Graph:** per level, `Lines > Alpha > LevelNN`. All levels and the Overlay feed `Master`, which multiplies them (black lines on white, exactly like Multiply). Duplicate level copies everything; up to 6 levels.
- **Lines node:**
  - Width, Angle, Dash length (0 = continuous), Dash gap, Rough edges, and a "Shift half a spacing" checkbox.
  - Lines V2 also has Frequency (waves across the picture) and Amplitude, per level.
  - Dollar 5 uses a fixed gentle wave (`LOOK.amp`, `LOOK.len`).
- **Alpha node:**
  - A **Matte** menu: Depth map (the default), Flip, Overlay, Hope, Blend.
  - An Extract (Black point, White point, Black softness, White softness) that applies to the chosen map.
  - Drag the Flip, Overlay, Hope or Blend node onto an Alpha to set its matte; green wires show the connection.
- **Master:** Spacing and Motion speed (default 0 = still), stored as CSS variables. At 0 the picture redraws only when something changes.
- **Solo / Hide:** they work like After Effects; several nodes can be soloed at once, and hide wins. Clicking a node solos it; click again to unsolo; clicking Master shows everything. Hides are saved; solo is not.
- **Depth map node:** Depth detail, Depth smoothing, Smoothness. Lines V2 loads the 50 MB depth model only when something needs it.
- **Flip node:**
  - Works from a detail map (local contrast).
  - Bands (0 = off; a bug where 0 flipped everything was fixed in v2.37), Detail size, Detail contrast, Detail threshold, Cross, Turn.
  - Flipped areas turn and cross-hatch.
- **Overlay node** (rebuilt in v2.31):
  - Takes the camera image, finds features with a difference of blurs and a soft threshold, plus Solid blacks.
  - Settings: Strength (default 0 in V2), Feature size 20, Contrast 22, Threshold 0.3, Softness 0.45, Solid blacks 0.18.
  - The camera texture (540 x 960, mipmapped) is always uploaded.
- **Hope node** (v2.38):
  - Lights the depth map with a virtual lamp, mixes in the photo, applies auto levels and posterizes in the shader with anti-aliased flat edges.
  - Settings: Levels, Light angle and height, Relief, Photo mix, Smoothness, Edge softness.
  - Update: Realtime, or 2 per second with a crossfade.
  - **Gerry finds this version "hopeless"; it is being rebuilt in Hope Lab (below).**
- **Blend node:** Overlay × depth map in 7 blend modes, with Mix.
- **Saving:**
  - Autosave per style (`genArt002.autosave.<view>.r13`), Start over, Save file / Load file (.json), and Presets (currently none).
  - The **-1 box** on every slider (since v2.35) mirrors the range: off (the default) gives the slider's own min to max; on gives -max to +max.

## Labs (research, not in the app yet)
Background agents made versions in three gallery artifacts. These are private claude.ai pages; Gerry can open them. The code is in `lab/` in this repo. Images and work files are NOT in the repo: Overlay Lab's images show Gerry's face, and the repo is public.

### Overlay Lab: brush strokes from the overlay
- Gallery: https://claude.ai/artifact/QwR7puZ9ppHqv7qd3TBrSy
- Code: `lab/overlay-lab/code/NNN.py` (Python with numpy and Pillow only; `lib.py`, `swirl.py`, `zones.py`, `010.py` is the engraver base).
- **Input:** a screenshot Gerry sent of the overlay on his own face, with yellow marks where strokes should go. **Not in the repo. Ask him to resend it** (the Python reads `overlay-lab/img/000-input.png` and `000-marks-only.png`).
- **Gerry's path through the versions:**
  1. He liked 003 (traced brush strokes).
  2. 008 is 003 + 25% detail.
  3. Then he wanted lines **parallel to each other**: 010-012 are evenly spaced Jobard-Lefer streamlines, where tone comes from line width.
  4. He liked 010/011 but wanted **more swirl**: 013-016. **016 is his favourite.**
  5. Zoned patterns (017-019) were a step back for him.
  6. Iterations on 016: 020 is clean-ups, 021 stronger, 022 calmer/elegant, 023 rays at the eyes.
- **Pending (interrupted by the usage limit):** versions 024+ with **eyes drawn like his reference**: a solid black iris with a white catchlight up-left, and 5-6 eccentric concentric rings bunching to one side and tightening into the iris, blended into the 016/022 swirl. His reference image is not in the repo; ask him to resend it.
- **Not decided yet:** which version goes into the app as an Overlay style. Live plan: the direction field on the GPU, tracing on the CPU at half resolution about once a second, line width from the live darkness texture at 30 fps.
- **Download proposals waiting for his OK:**
  - "Informative Drawings" (github.com/carolineec/informative-drawings), about 17 MB.
  - HED (huggingface.co/lllyasviel/Annotators), about 29 MB.
  - A face-landmark model, for proper zones.

### Hope Lab: a clean poster-like shading map ("Obama Hope" zones)
- Gallery: https://claude.ai/artifact/KxYwr51m1EbVrTVkm99eL6
- Code: `lab/hope-lab/code/`. Python with onnxruntime, using the repo's own Depth Anything ONNX model.
- **Inputs:** frames of `/tmp/clip/franklin.mp4` and `/tmp/clip/portrait.mp4`. These test clips are local to the old container and gone in a new one; no real camera face clip exists. **Ask Gerry for a camera still or clip.**
- **Results so far** (noise / fidelity, on input A and input B):

| Version | Idea | Noise A / B | Fidelity A / B |
|---|---|---|---|
| 001 | The app's current Hope | 1.4% / 0.7% | 0.89 / -0.34 (poor) |
| 002 | Edge-preserving posterize of the photo | 0% / 0% | 0.96 / 0.97 (best) |
| 003 | Same, k-means thresholds | 0% / 0% | 0.96 / 0.97 |
| 004 | Relit depth, light fitted to the photo | 0% / 0% | 0.88 / 0.92 |
| 005 | Superpixel blocks | 0% / 0% | 0.95 / 0.96 |
| 006 | Two-scale: masses + feature lines | 0.6% / 1.0% (the eyes count as small) | 0.94 / 0.96 |

- **Pending:** a temporal flicker test and stabiliser, Gerry's pick, then rebuilding the app's Hope with the winner.

### Motion Lab: Overlay 016 computed twice a second with smart in-between frames
- Gallery: https://claude.ai/artifact/8Php2UGs2oqpKJUthy78aG (**nothing published yet**).
- Code started: `lab/motion-lab/code/` (core.py, prep.py, ov/).
- **Plan, one method per version:**
  1. Hold the last keyframe.
  2. Crossfade.
  3. Optical-flow warp of both keyframes.
  4. Keep the traced line geometry, move its points with the flow, and update widths every frame.
  5. Method 4 plus per-line fade in/out.
- **Scoring:** ghosting, popping and cost.
- **The agent's last note:** the overlay is very sparse on the soft Franklin clip. It needs a better test sequence; a real camera clip from Gerry would solve it.

## Tests
- `lab/qa/qa_*.cjs` are Playwright scripts (scripts that test the owner PIN read it from the `OWNER_PIN` environment variable). They serve the repo with a small Node server and `/tmp/clip/*.mp4`, and take the scratchpad path as an argument.
- Paths inside them point to the old session's scratchpad and `/tmp/clip`; update both before running.
- Useful ones:
  - `qa_v2n` (Lines V2 nodes), `qa_d5` (Dollar 5 + depth), `qa_hope2` / `qa_hope3` (Hope / Blend).
  - `qa_neg` (the -1 mirror box), `qa_cache` (module stamps), `qa_views` (every style loads).
- **The container has no GPU:**
  - The V1 Line style (WebGPU) can't render, so its checks always fail there.
  - The depth model runs on the CPU and blocks the page for seconds, so use direct `evaluate` calls and long timeouts.

## Open items, in Gerry's order
1. Continue the Overlay 016 family: eyes like his reference (024+), then pick a version for the app.
2. Hope Lab: Gerry picks; then rebuild the app's Hope (002/003 look strongest so far) with temporal stability.
3. Motion Lab: get a real camera clip, finish versions 001-005, pick, and implement the 2-per-second mode with smart in-betweens.
4. Waiting on Gerry: download approvals (above), a raw camera still or clip, and his yellow-marked screenshot and eye reference again.
