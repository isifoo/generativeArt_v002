# GenerativeArt v003

v3.0 (the frame): a node graph, a parameters panel and a preview.
- Nodes: Camera / Video, Levels / Contrast, Invert, Ease (time smooth), Palette map, Output. One data type so far (Image); ports are typed and refuse other types and loops.
- Node canvas: drag nodes, drag from a dot to a dot to link, drag from a connected input to move or drop a link, tap a link and Delete, pan, wheel or two finger pinch to zoom, Fit, + Add node (searchable).
- Slider: pointer capture, first-touch drag, number field, cogwheel drawer with Min, Max, Step and Response (even, fine at the low or high end). Double click a slider name to reset it.
- AE style folds in the parameters panel; the global palette (same system as v002) shared by all nodes.
- Source: camera, a video file, or the built-in test picture. Patches (the graph) are saved in the browser and can be saved or loaded as a file.
- Not in v3.0: density driver, line generators, draw nodes, Tell Claude notes (see docs/FEATURES.md).
Docs: docs/REQUIREMENTS.md, CATALOGUE.md, FEATURES.md, DEV.md.
Tested: browser pane with the mouse (desktop and tablet layout). NOT yet tested on a real iPad touch or a live camera.
