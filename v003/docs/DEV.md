# Development procedure: GenerativeArt_v003

## Versions
v3.0 = the frame (slider component with cogwheel drawer, node canvas, ports and links, source + image nodes, palette).
v3.1 = density driver nodes, line generators, path operations, Tell Claude notes.
v3.2 = draw nodes, track matte, displacement.
v3.3 = depth with low power mode, old styles as patches, record.
Each version: a list of features from FEATURES.md, a test list, and a short README entry.

## For every change
1. Pick the feature row in FEATURES.md and set it to B.
2. Build it in its own small module (one node = one file). No copies: shared code is imported.
3. Test in the built-in browser pane on a recorded clip (camera and iPad are tested by Gerry; say clearly what was not tested).
4. A slider is kept only if moving it changes the picture. Test each one and record V or X.
5. Bump the 14 digit build stamp and version in index.html and version.json. The page shows the version and detects new deploys.
6. Update FEATURES.md (status, version) and the README section.
7. Commit only the files changed, push main and main:gh-pages, poll version.json until live.
8. Give the review URL at the end of every reply.

## iPad test list (slider and node canvas)
1. Drag a slider with a finger: moves on the first touch, 10 times in a row.
2. Drag while the page is scrolled: the page does not scroll.
3. Open and close the cogwheel drawer; set min, max, step; the slider follows.
4. Drag a node, drag a link, pinch to zoom, two finger pan.
5. Rotate the iPad: layout holds.

## Notes from the app (Tell Claude)
Notes live in the database. At the start of each session Claude reads open notes, says what each one means, fixes it, and marks it done in the chart.

## Methodology (Gerry, 2026-11-09)
1. Every attribute of a node goes in that node's panel. The top bar only holds project-level things (Save / Open / New project, Node board).
2. A button or control that does nothing is a bug: fix it or remove it.
