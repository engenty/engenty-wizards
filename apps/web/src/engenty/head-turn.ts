export const MAX_HEAD_TURN = Math.PI / 18;

// Screen Y points down; a negative 3D pitch turns the front of the face down.
export function headTurn(x: number, y: number): [number, number] {
  const scale = MAX_HEAD_TURN / Math.max(1, Math.hypot(x, y));
  return [x * scale, y === 0 ? 0 : -y * scale];
}
