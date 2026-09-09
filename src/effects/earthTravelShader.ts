export const TRAVEL_VERTEX = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`

export const TRAVEL_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_from,u_to;
uniform vec2 u_size,u_fromSize,u_toSize,u_fromAnchor,u_toAnchor;
uniform vec3 u_fromTint,u_toTint;
uniform vec2 u_scale,u_pan,u_sat;
uniform float u_mix,u_blur;

vec2 cover(vec2 uv,vec2 size,vec2 anchor,float scale,float pan){
  float imageAspect=size.x/size.y, aspect=u_size.x/u_size.y;
  vec2 crop=vec2(min(1.,aspect/imageAspect),min(1.,imageAspect/aspect));
  uv=(uv-.5)/scale+.5+vec2(pan,0.);
  return clamp(uv*crop+(1.-crop)*vec2(anchor.x,1.-anchor.y),.001,.999);
}
vec3 grade(vec3 c,vec3 tint,float sat){
  float gray=dot(c,vec3(.2126,.7152,.0722));
  return clamp(mix(vec3(gray),c,sat)*tint,0.,1.);
}
void main(){
  vec3 a=vec3(0.),b=vec3(0.);
  // A small fixed sample count creates radial travel streaks in one draw.
  // Blur receives velocity, not an autoplay clock: it clears when we stop.
  vec2 ray=(v_uv-vec2(.52,.52))*u_blur;
  for(int i=0;i<7;i++){
    float offset=(float(i)-3.)/6.;
    vec2 q=v_uv+ray*offset;
    a+=texture(u_from,cover(q,u_fromSize,u_fromAnchor,u_scale.x,u_pan.x)).rgb;
    b+=texture(u_to,cover(q,u_toSize,u_toAnchor,u_scale.y,u_pan.y)).rgb;
  }
  a=grade(a/7.,u_fromTint,u_sat.x);
  b=grade(b/7.,u_toTint,u_sat.y);
  outColor=vec4(mix(a,b,u_mix),1.);
}`
