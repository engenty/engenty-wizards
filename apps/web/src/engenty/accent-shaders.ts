import { FUR_COMMON_GLSL } from "./fur-shader";
export const ACCENT_VERTEX_SHADER = `${FUR_COMMON_GLSL}
in vec3 aPosition;
in vec3 aNormal;
in float aExtra;
out vec3 vNormal;
out float vAlpha;
void main(){
  int index=int(aExtra+0.5);
  vec3 p=aPosition;
  p.y+=sin(uTime*1.5+float(index)*1.7)*1.2;
  p.x+=cos(uTime*1.1+float(index))*0.5;
  vNormal=rotateCoat(aNormal);
  vAlpha=mix(uExtraMeta[index].y,1.0,0.65);
  gl_Position=projectCoat(poseCoat(p));
}
`;
export const ACCENT_FRAGMENT_SHADER = `${FUR_COMMON_GLSL}
in vec3 vNormal;
in float vAlpha;
out vec4 outColor;
void main(){
  vec3 n=normalize(vNormal),light=normalize(uLight);
  float diffuse=max(dot(n,light),0.0);
  vec3 color=mix(uDeep,uBody,0.55+diffuse*0.45)*(0.7+diffuse*0.45);
  vec3 halfLight=normalize(light+vec3(0.0,0.0,1.0));
  color+=vec3(0.85)*pow(max(dot(n,halfLight),0.0),48.0);
  color+=uTip*pow(1.0-abs(n.z),3.0)*0.2;
  outColor=vec4(color*vAlpha,vAlpha);
}
`;
