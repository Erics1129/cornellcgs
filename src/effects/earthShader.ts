/** Scroll is the only clock. Uses the parent's PI, rotate(), v_uv and existing
 * uniforms. NASA's north-up equirectangular image is flipped on upload, so
 * longitude / latitude map directly to increasing texture x / y. */
export const EARTH_SHADER = `
float earthLand(vec3 texel){
  // Ocean bathymetry is blue, vegetation green, desert red and ice neutral.
  // Brightness alone would turn shallow seas into invented continents.
  float vegetation=max(texel.r,texel.g*.90)-texel.b;
  float chroma=smoothstep(-.025,.035,vegetation);
  float ice=smoothstep(.48,.78,min(texel.r,texel.g));
  return max(chroma*smoothstep(.028,.095,max(texel.r,texel.g)),ice);
}

vec2 earthUV(vec3 n){
  return vec2(atan(n.x,n.z)/(2.*PI)+.5,asin(clamp(n.y,-1.,1.))/PI+.5);
}

vec3 earthPoint(float longitude,float latitude){
  vec2 a=vec2(longitude,latitude)*PI/180.;
  return vec3(cos(a.y)*sin(a.x),sin(a.y),cos(a.y)*cos(a.x));
}

float earthDestination(vec3 world,vec3 point,float pixel){
  float distance=length(world-point);
  float core=1.-smoothstep(pixel*.9,pixel*2.1,distance);
  float halo=exp(-pow(distance/max(pixel*4.5,.0001),2.));
  return core+halo*.38;
}

vec3 earth(){
  bool mobile=u_compact==1;
  float journey=clamp(u_progress,0.,1.);
  float orbit=smoothstep(0.,.24,journey);
  float approach=smoothstep(.23,.36,journey);
  vec2 origin=mobile?vec2(.5,.29):vec2(.70,.50);
  vec2 center=mix(origin,vec2(.5,.5),smoothstep(.23,.32,journey));
  float baseRadius=mobile?min(u_size.x*.465,u_size.y*.245):min(u_size.y*.435,u_size.x*.292);
  float radius=baseRadius*exp(log(u_size.y*3.4/baseRadius)*approach);
  vec2 p=(v_uv-center)*u_size/radius;
  float r=length(p);
  float pixel=1./radius;

  // A directional sunrise: electric blue at lower left, violet through the
  // shoulder, pale gold at upper right. The halo and surface share this light.
  float sunrise=smoothstep(-.65,.82,dot(p/max(r,.0001),normalize(vec2(.72,.69))));
  vec3 rim=mix(vec3(.055,.36,1.),vec3(.40,.32,.78),smoothstep(.16,.62,sunrise));
  rim=mix(rim,vec3(1.,.76,.43),smoothstep(.52,1.,sunrise));
  float outside=max(0.,r-1.);
  float halo=exp(-outside*outside/.00085)*.14+exp(-outside/.007)*.32;
  vec3 atmosphere=rim*halo*(1.-smoothstep(1.045,1.12,r));

  // Evaluate derivatives on the continuous sphere before any divergent branch
  // or quantization. This keeps dot filtering stable at cell and limb edges.
  vec3 n=vec3(p,sqrt(max(.000001,1.-dot(p,p))));
  float latitude=mix(15.+7.*sin(orbit*PI),-8.5,approach);
  // Westward orbit exposes the Americas and Pacific before returning to Asia.
  // -245 degrees is Bali's +115, avoiding an extra spin during the approach.
  float longitude=mix(20.-300.*orbit,-245.,approach);
  vec3 world=n;
  world.yz=rotate(latitude*PI/180.)*world.yz;
  world.xz=rotate(longitude*PI/180.)*world.xz;
  float footprint=max(length(dFdx(world)),length(dFdy(world)));
  if(r>1.12)return vec3(0.);
  if(r>=1.+pixel)return atmosphere;

  vec2 uv=earthUV(world);
  vec3 albedo=texture(u_image,uv).rgb;
  float land=earthLand(albedo);
  float terrain=dot(albedo,vec3(.22,.62,.16));
  vec3 key=normalize(vec3(.70,.62,.85));
  vec3 fill=normalize(vec3(-.80,-.35,.55));
  float daylight=max(0.,dot(n,key));
  float blueFill=max(0.,dot(n,fill));
  vec3 surface=vec3(.010,.023,.061)*(.48+.78*daylight);
  surface+=vec3(.012,.026,.052)*blueFill;
  surface+=land*vec3(.031,.045,.066)*(.35+terrain)*(.35+.65*daylight);
  // A trace of the original terrain emerges as the camera reaches Indonesia.
  surface+=albedo*land*(.018+.065*approach)*(.3+.7*daylight);

  // Staggered latitude rings have equal angular spacing. Each ring has an
  // integer number of cells, hence no seam at the texture's date line.
  float rows=floor(clamp(baseRadius*.60,108.,264.));
  float spacing=PI/rows;
  float row=clamp(floor(uv.y*rows),0.,rows-1.);
  float dotLat=((row+.5)/rows-.5)*PI;
  float columns=max(1.,floor(2.*rows*cos(dotLat)+.5));
  float stagger=mod(row,2.)*.5;
  float column=floor(uv.x*columns-stagger)+.5+stagger;
  vec2 dotUV=vec2(fract(column/columns),(row+.5)/rows);
  vec3 dotWorld=earthPoint((dotUV.x-.5)*360.,dotLat*180./PI);
  float dotDistance=length(world-dotWorld)/spacing;
  float antialias=clamp(footprint/spacing*.72,.018,.48);
  float dotShape=1.-smoothstep(.225-antialias,.225+antialias,dotDistance);
  float dotGlow=exp(-dotDistance*dotDistance/.095)*.13;
  float dotLand=earthLand(texture(u_image,dotUV).rgb);
  // Fade individual points before the projected pitch reaches Nyquist; the
  // dim continuous land underneath retains the coastline at the horizon.
  float resolved=1.-smoothstep(.24,.62,footprint/spacing);
  float visibility=smoothstep(.035,.24,n.z);
  vec3 pearl=mix(vec3(.53,.73,1.),vec3(1.,.95,.83),daylight*.83);
  surface+=pearl*(dotShape+dotGlow)*dotLand*resolved*visibility*(.36+.64*daylight);

  // Five geographic beacons, fixed to the same sphere; no labels or autoplay.
  float beacons=earthDestination(world,earthPoint(115.,-8.5),pixel)
    +earthDestination(world,earthPoint(-159.6,22.2),pixel)
    +earthDestination(world,earthPoint(12.3,46.6),pixel)
    +earthDestination(world,earthPoint(-19.,64.8),pixel)
    +earthDestination(world,earthPoint(-76.5,42.45),pixel);
  surface+=vec3(1.,.70,.30)*beacons*visibility*(1.-smoothstep(.27,.34,journey));

  float fresnel=pow(1.-clamp(n.z,0.,1.),3.3);
  surface+=rim*fresnel*.30;
  float edge=exp(-max(0.,1.-r)/max(.0035,pixel*1.2));
  surface+=mix(rim,vec3(1.,.93,.76),sunrise*.24)*edge*.58;
  float coverage=1.-smoothstep(1.-pixel,1.+pixel,r);
  return mix(atmosphere,surface,coverage);
}
`
