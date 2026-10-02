// Alpha-blended strands must be drawn from far to near. Mesh generation order
// only happens to match the front view; keeping it during a turn exposes a ring.
const STRIDE = 8;
const BINS = 256;

export function orderStrands(
  roots: Float32Array,
  target: Float32Array,
  turn: readonly [number, number],
  buckets: Uint16Array,
  counts: Uint32Array
): void {
  const sx = -Math.sin(turn[0]);
  const sy = Math.cos(turn[0]) * Math.sin(turn[1]);
  const sz = Math.cos(turn[0]) * Math.cos(turn[1]);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < roots.length; i += STRIDE) {
    const depth = roots[i] * sx + roots[i + 1] * sy + roots[i + 2] * sz;
    min = Math.min(min, depth);
    max = Math.max(max, depth);
  }
  counts.fill(0);
  const scale = (BINS - 1) / Math.max(max - min, 0.001);
  for (let i = 0; i < buckets.length; i++) {
    const offset = i * STRIDE;
    const depth =
      roots[offset] * sx + roots[offset + 1] * sy + roots[offset + 2] * sz;
    const bucket = Math.min(
      BINS - 1,
      Math.max(0, Math.floor((depth - min) * scale))
    );
    buckets[i] = bucket;
    counts[bucket]++;
  }
  let offset = 0;
  for (let i = 0; i < BINS; i++) {
    const count = counts[i];
    counts[i] = offset;
    offset += count;
  }
  for (let i = 0; i < buckets.length; i++) {
    const destination = counts[buckets[i]]++ * STRIDE;
    for (let axis = 0; axis < STRIDE; axis++) {
      target[destination + axis] = roots[i * STRIDE + axis];
    }
  }
}

export function strandOrderBuffer(roots: Float32Array) {
  return {
    roots,
    sorted: new Float32Array(roots.length),
    buckets: new Uint16Array(roots.length / STRIDE),
    counts: new Uint32Array(BINS),
    yaw: Number.NaN,
    pitch: Number.NaN,
  };
}
