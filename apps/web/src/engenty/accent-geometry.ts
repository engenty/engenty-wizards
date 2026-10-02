import type { FurGeometry, FurUniforms } from "./fur-renderer";

// Floating beads and tubular rays have their own volume and share body depth.
function accentVertices(u: FurUniforms): Float32Array {
  const vertices: number[] = [];
  for (let index = 0; index < u.extraMeta.length / 4; index++) {
    const [kind, , width, body] = u.extraMeta.slice(index * 4, index * 4 + 4);
    if (kind !== 2 && !(kind === 3 && body > 0.5)) {
      continue;
    }
    const [cx, cy, radius, span] = u.extras.slice(index * 4, index * 4 + 4);
    const rows = kind === 2 ? 16 : 32,
      columns = 16;
    const point = (row: number, column: number) => {
      const a =
        (row / rows) * (kind === 2 ? Math.PI : span * 2) -
        (kind === 2 ? 0 : span);
      const b = (column / columns) * Math.PI * 2;
      const n =
        kind === 2
          ? [Math.sin(a) * Math.cos(b), -Math.cos(a), Math.sin(a) * Math.sin(b)]
          : [
              Math.sin(a) * Math.cos(b),
              -Math.cos(a) * Math.cos(b),
              Math.sin(b),
            ];
      const centre =
        kind === 2
          ? [cx, cy, 0]
          : [cx + Math.sin(a) * radius, cy - Math.cos(a) * radius, 0];
      const size = kind === 2 ? radius : width * 0.5;
      return [...centre.map((v, i) => v + n[i] * size), ...n, index];
    };
    const triangle = (a: number[], b: number[], c: number[]) => {
      const x = b.map((v, i) => v - a[i]),
        y = c.map((v, i) => v - a[i]);
      const cross = [
        x[1] * y[2] - x[2] * y[1],
        x[2] * y[0] - x[0] * y[2],
        x[0] * y[1] - x[1] * y[0],
      ];
      const order =
        cross.reduce((v, n, i) => v + n * a[i + 3], 0) < 0
          ? [a, c, b]
          : [a, b, c];
      for (const v of order) {
        vertices.push(...v);
      }
    };
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const a = point(row, col),
          b = point(row + 1, col),
          c = point(row + 1, col + 1),
          d = point(row, col + 1);
        triangle(a, b, c);
        triangle(a, c, d);
      }
    }
  }
  return new Float32Array(vertices);
}
export function createAccentGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): FurGeometry {
  const cache = new Map<string, { buffer: WebGLBuffer; count: number }>();
  const attributes = [
    ["aPosition", 3, 0],
    ["aNormal", 3, 12],
    ["aExtra", 1, 24],
  ] as const;
  return {
    draw(u) {
      const key = `${u.extras.join(",")}:${u.extraMeta.join(",")}`;
      let entry = cache.get(key);
      if (!entry) {
        const buffer = gl.createBuffer();
        if (!buffer) {
          throw new Error("engenty: accessory allocation failed");
        }
        const data = accentVertices(u);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        entry = { buffer, count: data.length / 7 };
        cache.set(key, entry);
        if (cache.size > 24) {
          const oldest = cache.entries().next().value;
          if (oldest) {
            gl.deleteBuffer(oldest[1].buffer);
            cache.delete(oldest[0]);
          }
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
      for (const [name, size, offset] of attributes) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 28, offset);
      }
      gl.drawArrays(gl.TRIANGLES, 0, entry.count);
    },
    dispose() {
      for (const entry of cache.values()) {
        gl.deleteBuffer(entry.buffer);
      }
      cache.clear();
    },
  };
}
