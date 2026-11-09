# Line_v03 lab: candidate register

Page: https://isifoo.github.io/generativeArt_v002/line3lab/  (source: lab-work/v002/line3lab/)
Goal: ONE long line that winds around the picture. Density of the line = contrast. Gerry wants to CONTROL the shape: default straight long runs with sharp turns
(labyrinth of long straight strokes, rectangular U-turns), run length before the next turn controllable (ideally by an editable spline). Animation must be a
procedural transition (lines slide / grow / morph), NEVER pop or flicker.

## How to add / replace a candidate
1. Write `cN_name.js` in this folder. It exports `default { id, name, principle, control, motion, sliders:[{id,label,min,max,step,val}], curves?:[{id,label,xl,yl,pts}], create({W,H,canvas}) -> { draw(f) } }`.
   `f` = `{ P (slider values), curve (id -> f(x)), paper, ink (rgb 0..255), paperCss, inkCss }`. Canvas is 540 x 960. The candidate must be a PURE function of the
   shared eased tone field (`import { toneAt, boxMean, tone, GW, GH } from './shared.js'`), no hidden state that jumps.
2. Add the file name to `candidates.js` (and, when Gerry drops one, its entry to the DROPPED list there with `replacedBy`). Leave dropped modules in place: the page hides every id that is in the Dropped list (localStorage `line3lab.dropped`).
3. Bump the build (index.html meta + importmap + version.json, same 14 digit number), commit only this folder, push main and main:gh-pages.
4. Motion test: in the console, `__lab.popTest(A, B, 60)` blends two tone fields in 60 steps and returns per card the max / median change between consecutive pictures
   (ratio near 1 to 3 = gradual, above ~4 = a jump). Click a card picture to see it big.

## Candidates

| id | principle | status | transition (popTest max/median, clips A, G, A12) |
|---|---|---|---|
| c1_phase | phase-field serpentine (line3.js prototype): scalar phase, line at half steps, pieces with sharp jogs, rectangular U-turns | live | passes (1.5 to 2.1) |
| c2_hilbert | adaptive Hilbert curve, each square has a continuous split amount from mean tone (SAT), right-angled joins | live | passes (1.3 to 2.1) |
| c3_maze | random spanning tree on a grid, line walks round the tree, grid warped by tone (row / column spacing, Locality blend) | DROPPED by Gerry (no note). Settings: cells 20, straight 0.8, seed 7, range 6, con 2.2, loc 0.55, w 1.8 | passed (1.1 to 1.4) |
| c4_spiral | single rectangular (superellipse) spiral, running tone total along rays from the centre, rescaled to N turns | DROPPED by Gerry (no note). Settings: turns 30, p 14, range 5, con 1.6, w 1.6 | passed (1.7 to 2.1) |
| c5_meander | boustrophedon rows; each row a square wave, half period from tone via editable spline, height fades to 0 when runs are long | live | passes (1.1 to 2.8, steps slide, only enter at the border) |
| c6_peano | adaptive PEANO curve (3x3 squares visited column by column = long straight runs, rectangular U-turns); each square has a continuous split amount from mean tone through a spline; replaces c3 | live | passes (1.4 to 1.6) |
| c7_rubber | fixed Peano serpentine over an 81x162 grid that is stretched like rubber by tone (row / column spacing, Locality blend); route never changes; replaces c4 | live | passes (1.2 to 2.3) |

Notes: c6 and c7 share peano.js (the Peano rule). c7 is related to c3 (warped grid) but the route is a fixed Peano curve, not a maze. c1 rescales every piece to the same number of runs (so sparse areas can go almost empty); c3 changes maze only when Cells / Straightness / Seed is moved.
Editable spline controls: c2 (tone to detail), c4 (tone to density), c5 (tone to run length).

## Dropped
- c3_maze: no note given (assume look / feel). Replaced by c6_peano. Seeded in candidates.js (DROPPED), so the page hides it for everyone; Restore button brings it back.
- c4_spiral: no note given. Replaced by c7_rubber. Same.
More drops: the page keeps its own list in the browser; Gerry pastes "Copy dropped list" into Claude.

## Ideas not tried yet
- Growing / relaxing line: agents or active contour pulled by tone and by a straightness force, "keep straight for N then turn" (needs a stable, time-continuous state, e.g. grow from nothing with a fixed seed).
- Moore (closed Hilbert loop) / Gosper variants; mixed Peano + Hilbert per region.
- Maze on a quadtree with continuous merge: cell sizes animate (instead of c3's warped grid), or two mazes cross-faded.
- Truchet / diagonal switch tilings joined into one loop; dense tiles = more turns.
- Iso-contours of a smoothed tone field joined into one line (marching squares loops linked with bridges), true topographic look.
- Run length as a function of POSITION along the line (spline over arc length), not just tone.
- c1 with a direction field (runs bend with the picture), and an L-infinity ring so the whole serpentine has square corners at the jogs too.
- c2: smarter routing of the joins so big squares never cross small ones; corner rounding control.
- c3: spline for cell size vs tone; per-row straightness; closed outer frame.
