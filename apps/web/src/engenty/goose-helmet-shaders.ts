import { FUR_COMMON_GLSL } from "./fur-shader";

export const GOOSE_HELMET_VERTEX_SHADER = `${FUR_COMMON_GLSL}
in vec3 aPosition;
in vec3 aNormal;
out vec3 vNormal;

// The solid helmet follows the head but does not inherit Jelly deformation.
vec3 poseHelmet(vec3 p) {
  float w = TAU * uTime / uPeriod;
  vec3 q = p - vec3(60.0, 60.0, 0.0);
  q.xy += uLean * (1.15 - p.y / 120.0) * 0.3;
  q = rotateCoat(q);
  q.xy += vec2(60.0 + sin(w) * 1.5, 60.0 + cos(w * 0.8) * 1.1);
  return q;
}

void main() {
  vNormal = rotateCoat(aNormal);
  gl_Position = projectCoat(poseHelmet(aPosition));
}
`;

export const GOOSE_HELMET_FRAGMENT_SHADER = `${FUR_COMMON_GLSL}
in vec3 vNormal;
out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(uLight);
  vec3 view = vec3(0.0, 0.0, 1.0);
  float diffuse = max(dot(normal, light), 0.0);
  float bounce = max(dot(normal, normalize(vec3(0.75, 0.15, 0.7))), 0.0);
  vec3 red = vec3(0.94, 0.018, 0.025);
  // Sidewalls keep their red paint in shadow instead of reading as a black
  // underside or a detached insert.
  vec3 color = red * (0.68 + 0.3 * diffuse + 0.08 * bounce);
  float sheen = pow(max(dot(normal, normalize(light + view)), 0.0), 30.0);
  color += vec3(1.0, 0.6, 0.5) * sheen * 0.2;
  outColor = vec4(color, 1.0);
}
`;
