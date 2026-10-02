export interface JellySpring {
  vx: number;
  vy: number;
  x: number;
  y: number;
}

// Exact damped-spring update: elastic overshoot stays consistent at any frame rate.
export function stepJellySpring(
  state: JellySpring,
  target: readonly [number, number],
  dt: number
): void {
  if (dt <= 0) {
    return;
  }
  const stiffness = 110,
    damping = 3.8;
  const frequency = Math.sqrt(stiffness - damping * damping);
  const decay = Math.exp(-damping * dt);
  const c = Math.cos(frequency * dt),
    s = Math.sin(frequency * dt);
  for (const [axis, velocity, goal] of [
    ["x", "vx", target[0]],
    ["y", "vy", target[1]],
  ] as const) {
    const offset = state[axis] - goal,
      v = state[velocity];
    state[axis] =
      goal + decay * (offset * c + ((v + damping * offset) / frequency) * s);
    state[velocity] =
      decay * (v * c - ((damping * v + stiffness * offset) / frequency) * s);
  }
}
