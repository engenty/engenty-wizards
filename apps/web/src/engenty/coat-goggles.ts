// Leather follows the body surface; the raised bezel and glass use separate meshes.
export const COAT_GOGGLES_GLSL = `
vec4 gogglesOver(vec2 p, float aa, float front) {
  if (uGoggles < 0.5) return vec4(0.0);
  vec2 q = p - eyeCentre();
  float er = uEye.z * 1.35;
  float d = length(q);
  float outer = er * 1.27;
  float bandY = q.y + 1.7 * pow(q.x / max(uScale, 1.0), 2.0);
  float band = 1.0 - smoothstep(uEye.z * 0.31 - aa, uEye.z * 0.31 + aa, abs(bandY));
  // Taper into the surface; fine irregular coverage lets fur cover the strap ends.
  float skin = -sdBody(p);
  float grain = sin(p.x * 7.3 + sin(p.y * 4.1)) * 0.6;
  float tuck = smoothstep(0.5, 6.0, skin + grain);
  band *= tuck * mix(1.0, smoothstep(outer - aa, outer + aa, d), front);
  float curve = clamp(skin / max(uScale, 1.0), 0.0, 1.0);
  vec3 leather = mix(vec3(0.12, 0.055, 0.025), vec3(0.43, 0.24, 0.1), curve);
  float seam = 1.0 - smoothstep(0.12, 0.35, abs(abs(bandY) - uEye.z * 0.22));
  leather += vec3(0.11, 0.065, 0.025) * seam * step(0.4, fract(p.x * 0.65));
  vec4 acc = vec4(leather * band, band);
  return acc;
}
`;
