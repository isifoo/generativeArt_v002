// The Peano curve rule shared by c6 and c7. A square is given by an origin O and two edge vectors I and J; the curve enters at O and leaves at the opposite corner O+I+J.
// It splits into 3 x 3 children visited column by column (a serpentine); the children are mirrored so the curve stays one line:
// order (a along I, b along J): (0,0) (0,1) (0,2) (1,2) (1,1) (1,0) (2,0) (2,1) (2,2); mirror flags N, X, N, Y, XY, Y, N, X, N.
const SEQ = [[0, 0, 0], [0, 1, 1], [0, 2, 0], [1, 2, 2], [1, 1, 3], [1, 0, 2], [2, 0, 0], [2, 1, 1], [2, 2, 0]];
export function peanoKids(ox, oy, ix, iy, jx, jy) {      // returns 9 children as [ox, oy, ix, iy, jx, jy]
  const ax = ix / 3, ay = iy / 3, bx = jx / 3, by = jy / 3, out = [];
  for (const [a, b, m] of SEQ) {
    const px = ox + a * ax + b * bx, py = oy + a * ay + b * by;
    out.push(m === 0 ? [px, py, ax, ay, bx, by] : m === 1 ? [px + ax, py + ay, -ax, -ay, bx, by] : m === 2 ? [px + bx, py + by, ax, ay, -bx, -by] : [px + ax + bx, py + ay + by, -ax, -ay, -bx, -by]);
  }
  return out;
}
