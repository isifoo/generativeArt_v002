# Line_v03 lab: candidate register

Page: https://isifoo.github.io/generativeArt_v002/line3lab/  (source: lab-work/v002/line3lab/)
Goal: ONE long line that winds around the picture. Density of the line = contrast. Gerry wants to CONTROL the shape: default straight long runs with sharp turns
(labyrinth of long straight strokes, rectangular U-turns), run length before the next turn controllable (ideally by an editable spline). Animation must be a
procedural transition (lines slide / grow / morph), NEVER pop or flicker.

## How to add / replace a candidate
1. Write `cN_name.js` in this folder. It exports `default { id, name, principle, control, motion, sliders:[{id,label,min,max,step,val}], curves?:[{id,label,xl,yl,pts}], create({W,H,canvas}) -> { draw(f) } }`.
   `f` = `{ P (slider values), curve (id -> f(x)), paper, ink (rgb 0..255), paperCss, inkCss }`. Canvas is 540 x 960. The candidate must be a PURE function of the
   shared eased tone field (`import { toneAt, boxMean, tone, GW, GH } from './shared.js'`), no hidden state that jumps.
2. Add the file name to `candidates.js`. Leave dropped modules in place: the page hides every id that is in the Dropped list (localStorage `line3lab.dropped`).
3. Bump the build (index.html meta + importmap + version.json, same 14 digit number), commit only this folder, push main and main:gh-pages.
4. Motion test: in the console, `__lab.popTest(A, B, 60)` blends two tone fields in 60 steps and returns per card the max / median change between consecutive pictures
   (ratio near 1 to 3 = gradual, above ~4 = a jump). Click a card picture to see it big.

## Candidates

| id | principle | status | transition (popTest max/median, clips A, G, A12) |
|---|---|---|---|
| c1_phase | phase-field serpentine (line3.js prototype): scalar phase, line at half steps, pieces with sharp jogs, rectangular U-turns | live | passes (1.5 to 2.1) |
| c2_hilbert | adaptive Hilbert curve, each square has a continuous split amount from mean tone (SAT), right-angled joins | live | passes (1.3 to 2.1) |
| c3_maze | random spanning tree on a grid, line walks round the tree, grid warped by tone (row / column spacing, Locality blend) | live | passes (1.1 to 1.4), best looking so far |
| c4_spiral | single rectangular (superellipse) spiral, running tone total along rays from the centre, rescaled to N turns | live | passes (1.7 to 2.1) |
| c5_meander | boustrophedon rows; each row a square wave, half period from tone via editable spline, height fades to 0 when runs are long | live | passes (1.1 to 2.8, steps slide, only enter at the border) |

Notes: c1 rescales every piece to the same number of runs (so sparse areas can go almost empty); c3 changes maze only when Cells / Straightness / Seed is moved.
Editable spline controls: c2 (tone to detail), c4 (tone to density), c5 (tone to run length).

## Dropped
(none yet; the page keeps the list in the browser. Gerry pastes "Copy dropped list" into Claude.)

## Ideas not tried yet
- Growing / relaxing line: agents or active contour pulled by tone and by a straightness force, "keep straight for N then turn" (needs a stable, time-continuous state, e.g. grow from nothing with a fixed seed).
- Peano / Moore / Gosper variants (3x3 subdivision, Peano gives long straight runs) with the same continuous split-amount trick as c2.
- Maze on a quadtree with continuous merge: cell sizes animate (instead of c3's warped grid), or two mazes cross-faded.
- Truchet / diagonal switch tilings joined into one loop; dense tiles = more turns.
- Iso-contours of a smoothed tone field joined into one line (marching squares loops linked with bridges), true topographic look.
- Run length as a function of POSITION along the line (spline over arc length), not just tone.
- c1 with a direction field (runs bend with the picture), and an L-infinity ring so the whole serpentine has square corners at the jogs too.
- c2: smarter routing of the joins so big squares never cross small ones; corner rounding control.
- c3: spline for cell size vs tone; per-row straightness; closed outer frame.
