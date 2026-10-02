import type { FurGeometry, FurUniforms } from "./fur-renderer";
import { bodyMeshKey } from "./volume-mesh";

function surfaceDepth(u: FurUniforms, x: number, y: number): number {
  let low = 0,
    high = 200;
  for (let step = 0; step < 24; step++) {
    const z = (low + high) / 2;
    let field = 0;
    for (let i = 0; i < u.blobs.length; i += 4) {
      const [cx, cy, rx, ry] = u.blobs.slice(i, i + 4);
      if (rx <= 0) {
        continue;
      }
      field += Math.exp(
        -u.falloff *
          (((x - cx) / rx) ** 2 +
            ((y - cy) / ry) ** 2 +
            (z / ((rx * u.inflate) / 30)) ** 2)
      );
    }
    if (field > Math.exp(-u.falloff)) {
      low = z;
    } else {
      high = z;
    }
  }
  return (low + high) / 2;
}

// Real raised gasket, metal bezel, rivets and a shallow convex glass lens.
export function goggleVertices(u: FurUniforms): Float32Array {
  const vertices: number[] = [];
  const [cx, cy, r] = u.eye,
    er = r * 1.35,
    base = surfaceDepth(u, cx, cy);
  type Vertex = number[];
  const triangle = (a: Vertex, b: Vertex, c: Vertex) => {
    const x = b.map((v, i) => v - a[i]),
      y = c.map((v, i) => v - a[i]);
    const n = [
      x[1] * y[2] - x[2] * y[1],
      x[2] * y[0] - x[0] * y[2],
      x[0] * y[1] - x[1] * y[0],
    ];
    for (const v of n.reduce((sum, v, i) => sum + v * a[i + 3], 0) < 0
      ? [a, c, b]
      : [a, b, c]) {
      vertices.push(...v);
    }
  };
  const patch = (
    rows: number,
    cols: number,
    point: (u: number, v: number) => Vertex
  ) => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const a = point(row / rows, col / cols),
          b = point((row + 1) / rows, col / cols),
          c = point((row + 1) / rows, (col + 1) / cols),
          d = point(row / rows, (col + 1) / cols);
        triangle(a, b, c);
        triangle(a, c, d);
      }
    }
  };
  const ring = (
    radius: number,
    tube: number,
    z: number,
    depth: number,
    material: number
  ) =>
    patch(96, 16, (u, v) => {
      const a = u * Math.PI * 2,
        b = v * Math.PI * 2;
      const nx = (Math.cos(a) * Math.cos(b)) / tube,
        ny = (Math.sin(a) * Math.cos(b)) / tube,
        nz = Math.sin(b) / depth,
        l = Math.hypot(nx, ny, nz);
      return [
        cx + Math.cos(a) * (radius + Math.cos(b) * tube),
        cy + Math.sin(a) * (radius + Math.cos(b) * tube),
        base + z + Math.sin(b) * depth,
        nx / l,
        ny / l,
        nz / l,
        material,
      ];
    });
  ring(er * 1.14, er * 0.2, 0.3, 1.5, 0);
  ring(er * 1.13, er * 0.14, 2.1, 1.8, 1);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2,
      bx = cx + Math.cos(a) * er * 1.13,
      by = cy + Math.sin(a) * er * 1.13;
    patch(10, 12, (u, v) => {
      const a = u * Math.PI,
        b = v * Math.PI * 2,
        n = [Math.sin(a) * Math.cos(b), Math.sin(a) * Math.sin(b), Math.cos(a)];
      return [
        bx + n[0] * 0.65,
        by + n[1] * 0.65,
        base + 3.9 + n[2] * 0.4,
        ...n,
        2,
      ];
    });
  }
  patch(18, 96, (u, v) => {
    const a = v * Math.PI * 2,
      x = Math.cos(a) * u,
      y = Math.sin(a) * u;
    const n = [x * 0.45, y * 0.45, 1],
      l = Math.hypot(...n);
    return [
      cx + x * er,
      cy + y * er,
      base + 2.4 + 2.3 * (1 - u * u),
      n[0] / l,
      n[1] / l,
      n[2] / l,
      3,
    ];
  });
  return new Float32Array(vertices);
}

export function createGoggleGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): FurGeometry {
  const cache = new Map<string, { buffer: WebGLBuffer; count: number }>();
  const attributes = [
    ["aPosition", 3, 0],
    ["aNormal", 3, 12],
    ["aMaterial", 1, 24],
  ] as const;
  return {
    draw(u) {
      if (!u.goggles) {
        return;
      }
      const key = `${bodyMeshKey(u)}:${u.eye.join(",")}`;
      let entry = cache.get(key);
      if (!entry) {
        const buffer = gl.createBuffer();
        if (!buffer) {
          throw new Error("engenty: goggle allocation failed");
        }
        const data = goggleVertices(u);
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
      for (const { buffer } of cache.values()) {
        gl.deleteBuffer(buffer);
      }
      cache.clear();
    },
  };
}
