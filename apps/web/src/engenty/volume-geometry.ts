import type { FurGeometry, FurUniforms } from "./fur-renderer";
import { bodyMesh, bodyMeshKey } from "./volume-mesh";

// A bounded VAO-local GPU cache; changing pose never rebuilds a body's mesh.
export function createBodyGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): FurGeometry {
  const cache = new Map<string, { buffer: WebGLBuffer; count: number }>();
  const position = gl.getAttribLocation(program, "aPosition"),
    normal = gl.getAttribLocation(program, "aNormal");
  return {
    draw(u: FurUniforms) {
      const key = bodyMeshKey(u);
      let entry = cache.get(key);
      if (!entry) {
        const buffer = gl.createBuffer();
        if (!buffer) {
          throw new Error("engenty: body allocation failed");
        }
        const mesh = bodyMesh(u);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        entry = { buffer, count: mesh.vertices.length / 6 };
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
      for (const [location, offset] of [
        [position, 0],
        [normal, 12],
      ]) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset);
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
