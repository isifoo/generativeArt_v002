// The list of candidate modules shown on the page (one file each). To REPLACE a candidate, add the new file name here (and leave the old one in place:
// the page hides every candidate that is in the Dropped list). Every module exports default { id, name, principle, control, motion, sliders, curves?, create(env) }.
export const CANDIDATES = [
  'c1_phase.js',
  'c2_hilbert.js',
  'c3_maze.js',
  'c4_spiral.js',
  'c5_meander.js',
  'c6_peano.js',
  'c7_rubber.js',
];

// Dropped by Gerry before the replacements were made: hidden by default (the Dropped list shows them with a Restore button).
export const DROPPED = [
  { id: 'c3_maze', name: 'Spanning-tree labyrinth', principle: 'Random maze (tree over the cells), the line walks round the outside of it; grid squeezed by tone.', control: 'Straightness, Cells, Density range, Locality.', note: '(no note given)', params: '{"cells":20,"straight":0.8,"seed":7,"range":6,"con":2.2,"loc":0.55,"w":1.8}', at: '2026-11-09', replacedBy: 'c6_peano' },
  { id: 'c4_spiral', name: 'Rectangular spiral (one contour)', principle: 'One spiral from a running tone total along rays from the centre; superellipse rings.', control: 'Corner sharpness, Turns, centre.', note: '(no note given)', params: '{"turns":30,"p":14,"range":5,"con":1.6,"w":1.6}', at: '2026-11-09', replacedBy: 'c7_rubber' },
];
