import { FUR_COMMON_GLSL } from "./fur-shader";
export const GOGGLE_VERTEX_SHADER = `${FUR_COMMON_GLSL}
in vec3 aPosition;
in vec3 aNormal;
in float aMaterial;
out vec3 vNormal;
flat out int vMaterial;
void main(){
  vNormal=poseNormal(aPosition,aNormal);
  vMaterial=int(aMaterial+0.5);
  gl_Position=projectCoat(poseCoat(aPosition));
}
`;
export const GOGGLE_FRAGMENT_SHADER = `${FUR_COMMON_GLSL}
in vec3 vNormal;
flat in int vMaterial;
out vec4 outColor;
void main(){
  vec3 n=normalize(vNormal),light=normalize(uLight),view=vec3(0.0,0.0,1.0);
  float diffuse=max(dot(n,light),0.0);
  float spec=pow(max(dot(n,normalize(light+view)),0.0),48.0);
  if(vMaterial==3){
    float fres=0.025+0.975*pow(1.0-max(dot(n,view),0.0),5.0);
    float shine=pow(max(dot(n,normalize(light+view)),0.0),100.0);
    float alpha=0.045+fres*0.3+shine*0.38;
    vec3 glass=mix(vec3(0.35,0.65,0.73),vec3(1.0),clamp(shine*3.0,0.0,1.0));
    outColor=vec4(glass*alpha,alpha);return;
  }
  vec3 base=vMaterial==0?vec3(0.1,0.065,0.04):vMaterial==2?vec3(0.3,0.18,0.07):vec3(0.68,0.4,0.12);
  vec3 reflected=mix(vec3(0.1,0.065,0.04),vec3(1.0,0.85,0.52),smoothstep(-0.7,0.8,-reflect(-view,n).y));
  vec3 color=base*(0.4+diffuse*0.75)+reflected*(vMaterial==0?0.04:0.27)+vec3(1.0,0.9,0.65)*spec*(vMaterial==0?0.1:0.8);
  outColor=vec4(color,1.0);
}
`;
