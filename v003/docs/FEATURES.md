# Features chart: GenerativeArt_v003

Status: P planned, B built and tested in the browser pane, waiting for Gerry's iPad test, W working (tested on the iPad), F broken, D dropped. Updated at every deploy.

| # | Feature | Status | Version | Notes |
|---|---|---|---|---|
| 1 | Requirements written | W | doc 0 | REQUIREMENTS.md |
| 2 | Module catalogue (node library draft) | W | doc 0 | CATALOGUE.md, params inventory json |
| 3 | Slider component: pointer capture, works first drag on iPad | B | v3.0 | must pass the iPad test list |
| 4 | Slider cogwheel drawer: min, max, step, progression | B | v3.0 | replaces the -1 box |
| 5 | AE style folding sections | B | v3.0 | taken from Letters |
| 6 | Node canvas: drag nodes, pan, zoom | B | v3.0 | new editor |
| 7 | Typed ports and links (drag to connect) | B | v3.0 | Image, Mask, Field, Path, Points, Colour, Curve |
| 8 | Execution graph (GPU image nodes, path nodes) | B | v3.0 | |
| 9 | Source nodes: camera / video (falls back to a moving test picture) | B | v3.0 | |
| 10 | Image tools: levels, invert, ease (edge detect moves to v3.1) | B | v3.0 | |
| 11 | Density driver as small nodes (tone to field, field range) | P | v3.1 | |
| 12 | Line generators: serpentine, meander (with angle), Peano | P | v3.1 | from the lab |
| 13 | Path operations: rotate, straighten, smooth, wave | P | v3.1 | |
| 14 | Draw nodes: stroke, dots, circles, letters, edge glyphs | P | v3.2 | |
| 15 | Palette (global, Adobe style) wired into draw nodes | B | v3.0 | existing palette.js |
| 16 | Track matte node | P | v3.2 | |
| 17 | Displacement map node | P | v3.2 | |
| 18 | Depth node (with low power mode) | P | v3.3 | depth crash fix first |
| 19 | Old styles as saved patches | P | v3.3 | |
| 20 | Tell Claude button + "does nothing" flag per slider, notes database | P | v3.1 | Firestore, read by Claude at session start |
| 21 | Set default per node | P | v3.1 | |
| 22 | Features chart page inside the app | P | v3.2 | this file as data |
| 23 | Record / export | P | v3.3 | |
| 24 | Camera angle / sway / turn controls | D | | not wanted |
