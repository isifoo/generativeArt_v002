# GenerativeArt_v003: requirements (from Gerry, 2026-11-09)

Status: decided with Gerry. Web app (installable on iPad, PC browser). Not native for now; a wrapper (Capacitor / Tauri) only if export or speed becomes a real limit.

## What it is
An application, not a list of styles. The user builds a look by connecting nodes (like Houdini). Today's styles (Letters, Ishihara, Depth dots, Lines, LineSquare, Windows, Depth) become small nodes plus saved ready-made patches.

## Decisions
1. Replace the current Nodes editor (about 30 % of the idea) with a new one. Do not grow the old one.
2. Old styles stay as ready-made patches (saved node graphs), so nothing is lost.
3. A cloud database holds the notes written from the app (same service as AAMM / Firestore).
4. Database first: catalogue every module made so far (see CATALOGUE.md), then build.

## The node editor
1. Drag nodes, drag links between ports. A port only accepts a matching type (Image, Mask, Number field, Path, Colour, Curve).
2. Node families Gerry named: track matte, distortion (displacement map as in After Effects), colour (the Adobe-style colour system already in the app, global), line generation (as now), path operations (simulate, curves), and the density driver (contrast to density) broken into small simple parts the user combines.
3. Every node and every slider has a direct line to Claude ("HERE"): a Tell Claude button that writes a note (node, settings, version) to the database. A slider can be flagged "does not do anything". Claude reads the notes at the start of a session, acknowledges them, and changes the app.
4. "Set default" per node stays.

## Sliders (this is a rule for the whole app)
1. Only parameters that visibly change the result. If a slider's effect is not seen, it is removed (or hidden until it is proven).
2. No camera-angle, sway or turn controls (Gerry had to fix these before and does not want them).
3. The slider must work on the iPad on the first drag (current ones sometimes need a retry). Pointer events with capture, large touch target, no page scroll while dragging.
4. No "-1" box. Instead a cogwheel on every slider that opens a drawer below it (folds and unfolds). The drawer holds: min, max, step, and a progression (response curve) like 0.01, 0.25, 1 so the slider has fine steps at one end and big steps at the other.
5. After Effects style folding sections, like Letters (Grid / Type), keep and use everywhere.

## Development
1. A features chart (FEATURES.md, later a page in the app): each feature is planned, working, broken, or dropped.
2. Versions and a procedure (DEV.md): every version has a test list; Claude updates the chart on every deploy.
3. Version stamp on every page, auto-detect new deploys, deploy through the known flow.
