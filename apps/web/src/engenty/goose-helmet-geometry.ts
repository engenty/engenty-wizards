// Goose stage 1: one rigid flight-helmet shell with an open face.
// Its broader crown and shaped brow are reviewed before fittings and glass.
import type { FurGeometry, FurUniforms } from "./fur-renderer";
import type { EngentyCoat } from "./fur-stage";
import { GOOSE_HELMET_FIT, GOOSE_HELMET_KINDS, type GooseHelmetKind } from "./goose-helmet-fit";

type Vertex = [number, number, number, number, number, number];
const RX = 54;
const RY = 51;
const RZ = 49;

function createHelmetVertices(): Float32Array {
  const vertices: number[] = [];
  const triangle = (a: Vertex, b: Vertex, c: Vertex) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const ordered = cross[0] * a[3] + cross[1] * a[4] + cross[2] * a[5] < 0 ? [a, c, b] : [a, b, c];
    for (const vertex of ordered) vertices.push(...vertex);
  };
  const patch = (rows: number, columns: number, point: (row: number, column: number) => Vertex) => {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = point(row / rows, column / columns);
        const b = point((row + 1) / rows, column / columns);
        const c = point((row + 1) / rows, (column + 1) / columns);
        const d = point(row / rows, (column + 1) / columns);
        triangle(a, b, c);
        triangle(a, c, d);
      }
    }
  };
  const smoothstep = (start: number, end: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return t * t * (3 - 2 * t);
  };
  const browAngle = (phi: number) => {
    const fromFront = Math.acos(Math.cos(phi));
    const arch = smoothstep(0, 1.05, fromFront);
    const opening = smoothstep(0.7, 1.1, fromFront);
    const back = smoothstep(1.2, 1.75, fromFront);
    return 1.14 + 0.25 * arch + 1.13 * opening - 0.24 * back;
  };
  const shell = (theta: number, phi: number): Vertex => {
    const lower = theta > Math.PI / 2;
    const taper = Math.max(0, Math.min(1, (theta - Math.PI / 2) / (2.52 - Math.PI / 2)));
    const radial = lower ? 1 - 0.14 * taper * taper * (3 - 2 * taper) : Math.sin(theta);
    const radialSlope = lower
      ? (-0.14 * 6 * taper * (1 - taper)) / (2.52 - Math.PI / 2)
      : Math.cos(theta);
    const sx = radial * Math.sin(phi);
    const sy = -Math.cos(theta);
    const sz = radial * Math.cos(phi);
    const nx = Math.sin(phi) / RX;
    const ny = -radialSlope / (RY * Math.sin(theta));
    const nz = Math.cos(phi) / RZ;
    const length = Math.hypot(nx, ny, nz);
    return [60 + RX * sx, 61 + RY * sy, RZ * sz, nx / length, ny / length, nz / length];
  };

  // Stage one stops at the rigid crown and its curved brow. Ear cups, painted
  // graphics and the shield are independent pieces added only after this fit.
  patch(44, 144, (row, column) => {
    const phi = (column * 2 - 1) * Math.PI;
    return shell(0.001 + row * (browAngle(phi) - 0.001), phi);
  });
  return new Float32Array(vertices);
}

const HELMET_VERTICES = createHelmetVertices();

function fitHelmetVertices(kind: GooseHelmetKind, coat: EngentyCoat): Float32Array {
  const fit = GOOSE_HELMET_FIT[kind];
  if (kind === "round" && coat === "fur") return HELMET_VERTICES;
  // Jelly has no fur halo, so its solid body needs a smaller rigid shell.
  const coatWidth = coat === "jelly" ? (kind === "drop" ? 0.75 : 0.82) : 1;
  const width = fit.width * coatWidth;
  const height = fit.height * (coat === "jelly" ? 0.88 : 1);
  const depth = fit.depth * (coat === "jelly" ? 0.85 : 1);
  const vertices = new Float32Array(HELMET_VERTICES.length);
  for (let i = 0; i < vertices.length; i += 6) {
    const y = HELMET_VERTICES[i + 1];
    vertices[i] = 60 + (HELMET_VERTICES[i] - 60) * width;
    vertices[i + 1] = 61 + (y - 61) * height + fit.offsetY;
    vertices[i + 2] = HELMET_VERTICES[i + 2] * depth;
    const nx = HELMET_VERTICES[i + 3] / width;
    const ny = HELMET_VERTICES[i + 4] / height;
    const nz = HELMET_VERTICES[i + 5] / depth;
    const length = Math.hypot(nx, ny, nz);
    vertices[i + 3] = nx / length;
    vertices[i + 4] = ny / length;
    vertices[i + 5] = nz / length;
  }
  return vertices;
}

export function createGooseHelmetGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  coat: EngentyCoat,
): FurGeometry {
  const buffers = new Map<GooseHelmetKind, WebGLBuffer>();
  for (const kind of GOOSE_HELMET_KINDS) {
    const buffer = gl.createBuffer();
    if (!buffer) {
      for (const allocated of buffers.values()) gl.deleteBuffer(allocated);
      throw new Error("engenty: helmet allocation failed");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, fitHelmetVertices(kind, coat), gl.STATIC_DRAW);
    buffers.set(kind, buffer);
  }
  const attributes = [
    ["aPosition", 3, 0],
    ["aNormal", 3, 12],
  ] as const;
  return {
    draw(u: FurUniforms) {
      if (!(u.gooseHelmet && u.helmetKind)) return;
      const buffer = buffers.get(u.helmetKind);
      if (!buffer) throw new Error("engenty: helmet shape is missing");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      for (const [name, size, offset] of attributes) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 24, offset);
      }
      gl.drawArrays(gl.TRIANGLES, 0, HELMET_VERTICES.length / 6);
    },
    dispose() {
      for (const buffer of buffers.values()) gl.deleteBuffer(buffer);
    },
  };
}
