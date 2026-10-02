// Deterministic roots sampled by triangle area over the entire closed surface.
// Surface sampling naturally packs more projected hairs around the silhouette.
import type { FurGeometry, FurUniforms } from "./fur-renderer";
import { orderStrands, strandOrderBuffer } from "./strand-order";
import { bodyMesh, bodyMeshKey } from "./volume-mesh";

export function strandRoots(u: FurUniforms): Float32Array {
  const mesh = bodyMesh(u);
  let seed = 781;
  const random = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return seed / 4_294_967_296;
  };
  const roots: number[] = [];
  const perArea = Math.min(200, Math.max(10, u.density)) ** 2 / 4000;
  const v = mesh.vertices;
  for (let i = 0; i < v.length; i += 18) {
    const ab = [v[i + 6] - v[i], v[i + 7] - v[i + 1], v[i + 8] - v[i + 2]],
      ac = [v[i + 12] - v[i], v[i + 13] - v[i + 1], v[i + 14] - v[i + 2]];
    const area =
      Math.hypot(
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0]
      ) * 0.5;
    const expected = area * perArea,
      count = Math.floor(expected) + (random() < expected % 1 ? 1 : 0);
    for (let j = 0; j < count; j++) {
      const r = Math.sqrt(random()),
        t = random(),
        weights = [1 - r, r * (1 - t), r * t];
      const point = Array.from({ length: 6 }, (_, axis) =>
        weights.reduce((sum, w, k) => sum + w * v[i + k * 6 + axis], 0)
      );
      const len = Math.hypot(point[3], point[4], point[5]);
      roots.push(
        point[0],
        point[1],
        point[2],
        point[3] / len,
        point[4] / len,
        point[5] / len,
        random(),
        random()
      );
    }
  }
  return new Float32Array(roots);
}

export function createStrandGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): FurGeometry {
  const cache = new Map<
    string,
    {
      buffer: WebGLBuffer;
      count: number;
      order: ReturnType<typeof strandOrderBuffer>;
    }
  >();
  const root = gl.getAttribLocation(program, "aRoot"),
    normal = gl.getAttribLocation(program, "aNormal"),
    random = gl.getAttribLocation(program, "aRandom");
  return {
    draw(u) {
      const key = `${bodyMeshKey(u)}:${u.density}`;
      let entry = cache.get(key);
      if (!entry) {
        const buffer = gl.createBuffer();
        if (!buffer) {
          throw new Error("engenty: strand allocation failed");
        }
        const roots = strandRoots(u);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, roots, gl.DYNAMIC_DRAW);
        entry = {
          buffer,
          count: roots.length / 8,
          order: strandOrderBuffer(roots),
        };
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
      const turn = u.turn ?? [0, 0];
      const order = entry.order;
      if (order.yaw !== turn[0] || order.pitch !== turn[1]) {
        orderStrands(
          order.roots,
          order.sorted,
          turn,
          order.buckets,
          order.counts
        );
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, order.sorted);
        order.yaw = turn[0];
        order.pitch = turn[1];
      }
      for (const [location, size, offset] of [
        [root, 3, 0],
        [normal, 3, 12],
        [random, 2, 24],
      ]) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset);
        gl.vertexAttribDivisor(location, 1);
      }
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 18, entry.count);
    },
    dispose() {
      for (const entry of cache.values()) {
        gl.deleteBuffer(entry.buffer);
      }
      cache.clear();
    },
  };
}
