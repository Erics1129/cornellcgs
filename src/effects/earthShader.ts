/** Scroll is the only clock. Expects the parent's PI, rotate(), v_uv and
 * u_image/u_size/u_pointer/u_progress/u_compact declarations.
 * Coordinates assume a north-up, Greenwich-centred equirectangular texture.
 * SceneCanvas flips the source image vertically on upload. */
export const EARTH_SHADER = `
vec3 earth(){
  bool mobile=u_compact==1;
  float journey=clamp(u_progress,0.,1.);
  float orbit=smoothstep(0.,.34,journey);
  float approach=smoothstep(.30,.53,journey);
  float coast=smoothstep(.43,.53,journey);
  vec2 origin=mobile?vec2(.5,.29):vec2(.69,.50);
  vec2 center=mix(origin,vec2(.5,.52),smoothstep(.22,.38,journey));
  float baseRadius=mobile?min(u_size.x*.47,u_size.y*.25):u_size.y*.43;
  float radius=mix(baseRadius,u_size.y*2.35,approach);
  vec2 p=(v_uv-center)*u_size/radius;
  // Pointer parallax quietly recedes as we settle over the continent.
  p-=u_pointer*.018*(1.-approach);
  float r=length(p);
  if(r>1.12)return vec3(0.);
  vec3 glow=vec3(.12,.36,.68)*exp(-max(0.,r-1.)*44.)*.28;
  if(r>=1.)return glow*(1.-smoothstep(1.,1.12,r));
  vec3 n=vec3(p,sqrt(max(0.,1.-dot(p,p))));
  // Rotate latitude FIRST. At screen centre the sample is then exactly
  // (cos(lat)*sin(lon), sin(lat), cos(lat)*cos(lon)). Reversing this order
  // tilts the poles instead of landing on North America.
  float latitude=mix(12.,38.,smoothstep(.16,.34,journey));
  latitude=mix(latitude,40.7,coast);
  float longitude=mix(115.,-100.,orbit);
  longitude=mix(longitude,-74.,coast);
  vec3 nn=n;
  nn.yz=rotate(latitude*PI/180.)*nn.yz;
  nn.xz=rotate(longitude*PI/180.)*nn.xz;
  vec2 uv=vec2(atan(nn.x,nn.z)/(2.*PI)+.5,asin(clamp(nn.y,-1.,1.))/PI+.5);
  vec3 albedo=texture(u_image,uv).rgb;
  vec3 light=normalize(vec3(-.65,.45,1.25));
  float diffuse=max(0.,dot(n,light));
  vec3 surface=albedo*(.22+.88*diffuse);
  float fresnel=pow(1.-n.z,3.6);
  vec3 atmosphere=vec3(.12,.38,.75)*fresnel*(.35+.55*diffuse);
  float sea=1.-smoothstep(.035,.14,albedo.r);
  float spec=pow(max(0.,dot(reflect(-light,n),vec3(0.,0.,1.))),70.)*.12*sea;
  return (surface+atmosphere+spec)*(1.-smoothstep(.996,1.,r));
}
`
