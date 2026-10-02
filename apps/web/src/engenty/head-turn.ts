export const MAX_HEAD_TURN = Math.PI / 18;

// Keep the face readable: the combined pitch/yaw follows gaze within ten degrees.
export function headTurn(x: number, y: number): [number, number] {
  const scale = MAX_HEAD_TURN / Math.max(1, Math.hypot(x, y));
  return [x * scale, y * scale];
}
