"""Original storybook mesh authoring, plus licensed character-rig adaptation.
Run in Blender 4.5 background. Geometry authored in metres, Z up / -Y front.
No generated image is passed off as a 3D asset: lofts, botanical leaves,
interior cannon bores, page stacks and physical tier changes are actual meshes.
"""
import bpy, math, random, os, json, sys
sys.path.insert(0,os.path.dirname(__file__))
from mathutils import Vector, Matrix
from pathlib import Path
from math import sin,cos,pi,sqrt
random.seed(7341)
# The Unity project that owns this Tools folder; CARROT_UNITY_ROOT overrides it for scratch copies.
ROOT=Path(os.environ.get('CARROT_UNITY_ROOT') or Path(__file__).resolve().parents[1])
OUT=ROOT/'Assets/Resources/Carrot/Models/Source';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=Path('/Users/eric/Claude/carrot-defense-preproduction/source-assets/quaternius-poly-pizza')
GOLD=(.69,.39,.095,1);BRASS=(.88,.64,.24,1);WOOD=(.22,.095,.025,1);BARK=(.36,.17,.052,1);GREEN=(.19,.40,.075,1);LEAF=(.38,.58,.12,1);STONE=(.36,.40,.34,1);ICE=(.38,.83,.98,1);VIOLET=(.52,.18,.80,1);CREAM=(.92,.83,.63,1);DARK=(.045,.032,.025,1)
manifest=[]

def clear():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for d in list(bpy.data.materials):bpy.data.materials.remove(d)

def empty(name,parent=None,loc=(0,0,0)):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;o.location=loc;return o

def mat(name='Organic'):
 m=bpy.data.materials.get(name)
 if m:return m
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;bs=n.get('Principled BSDF');v=n.new('ShaderNodeVertexColor');v.layer_name='Color';m.node_tree.links.new(v.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.42 if name=='Metal' else .7;bs.inputs['Metallic'].default_value=.68 if name=='Metal' else 0
 if name=='Glow':m.node_tree.links.new(v.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=.25
 return m

def mesh(name,verts,faces,col,parent,material='Organic',smooth=True):
 if material=='Organic':
  if name=='CarrotSkin':material='Carrot'
  elif name=='SculptedFur':material='Fur'
  elif name in ['SweptTentacle','SkinNodule','TentacleSucker']:material='Scale'
  elif any(k in name for k in ['Leaf','MossFern']):material='Leaf'
  elif 'Petal' in name:material='Petal'
  elif any(k in name for k in ['Root','Wood','Stalk','Antler','Bark','Stem','Branch','Staff']):material='Bark'
  elif any(k in name for k in ['Stone','Rock']):material='Stone'
 if material in ['Carrot','Leaf','Fur','Scale']:col=(1,1,1,1)
 m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.parent=parent;m.materials.append(mat(material));a=m.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for p in m.polygons:
  p.use_smooth=smooth
  for li in p.loop_indices:a.data[li].color=col
 uv=m.uv_layers.new(name='UVMap')
 for p in m.polygons:
  for li in p.loop_indices:
   co=m.vertices[m.loops[li].vertex_index].co;uv.data[li].uv=((math.atan2(co.y,co.x)/2/pi+.5),co.z)
 return o

def lathe(name,profile,col,parent,loc=(0,0,0),segments=32,material='Organic',lobes=0):
 vs=[];fs=[]
 for j,(r,z) in enumerate(profile):
  for i in range(segments):
   a=2*pi*i/segments;rr=r*(1+.055*cos(a*lobes)) if lobes else r;vs.append((loc[0]+rr*cos(a),loc[1]+rr*sin(a),loc[2]+z))
 for j in range(len(profile)-1):
  for i in range(segments):k=j*segments+i;n=j*segments+(i+1)%segments;fs.append((k,n,n+segments,k+segments))
 fs.append(tuple(range(segments-1,-1,-1)));fs.append(tuple((len(profile)-1)*segments+i for i in range(segments)))
 return mesh(name,vs,fs,col,parent,material)

def tube(name,pts,radii,col,parent,sides=8,material='Organic'):
 vs=[];fs=[];pv=[Vector(p) for p in pts]
 if isinstance(radii,(int,float)):radii=[radii]*len(pv)
 for j,p in enumerate(pv):
  t=(pv[min(j+1,len(pv)-1)]-pv[max(0,j-1)]).normalized();n=t.cross(Vector((0,0,1)))
  if n.length<.01:n=t.cross(Vector((0,1,0)))
  n.normalize();b=t.cross(n).normalized()
  for i in range(sides):vs.append(tuple(p+radii[j]*(n*cos(2*pi*i/sides)+b*sin(2*pi*i/sides))))
 for j in range(len(pv)-1):
  for i in range(sides):k=j*sides+i;n=j*sides+(i+1)%sides;fs.append((k,n,n+sides,k+sides))
 fs+=[tuple(range(sides-1,-1,-1)),tuple((len(pv)-1)*sides+i for i in range(sides))]
 o=mesh(name,vs,fs,col,parent,material)
 cumulative=[0.0]
 for j in range(1,len(pv)):cumulative.append(cumulative[-1]+(pv[j]-pv[j-1]).length)
 uv=o.data.uv_layers.active
 for poly in o.data.polygons:
  for li in poly.loop_indices:
   vi=o.data.loops[li].vertex_index;row=vi//sides;uv.data[li].uv=((vi%sides)/sides,cumulative[row]*2.0)
 return o

def ellipsoid(name,loc,scale,col,parent,segments=16,rings=10,material='Organic'):
 vs=[];fs=[]
 for j in range(rings+1):
  v=pi*j/rings
  for i in range(segments):
   a=2*pi*i/segments;vs.append((loc[0]+scale[0]*sin(v)*cos(a),loc[1]+scale[1]*sin(v)*sin(a),loc[2]+scale[2]*cos(v)))
 for j in range(rings):
  for i in range(segments):k=j*segments+i;n=j*segments+(i+1)%segments;fs.append((k,n,n+segments,k+segments))
 return mesh(name,vs,fs,col,parent,material)

def leaf(name,start,end,width,col,parent,curve=.08,material='Organic'):
 a=Vector(start);b=Vector(end);d=b-a;side=d.cross(Vector((0,0,1)))
 if side.length<.01:side=Vector((1,0,0))
 side.normalize();vs=[];N=9
 for j in range(N):
  t=j/(N-1);mid=a+d*t+Vector((0,0,curve*sin(pi*t)));w=width*sin(pi*t)**.75
  for u in [-1,0,1]:vs.append(tuple(mid+side*w*u+Vector((0,0,.022*(1-abs(u))*sin(pi*t)))))
 # A thin closed volume avoids opposing coplanar faces and canceled normals.
 count=len(vs);vs += [(x,y,z-.007) for x,y,z in vs];fs=[]
 for j in range(N-1):
  for i in range(2):
   k=j*3+i;fs.extend([(k,k+1,k+4,k+3),(k+count+3,k+count+4,k+count+1,k+count)])
  a=j*3;b=(j+1)*3;fs.append((a,b,b+count,a+count));a=j*3+2;b=(j+1)*3+2;fs.append((b,a,a+count,b+count))
 return mesh(name,vs,fs,col,parent,material)

def ring(name,r,z,col,parent,thick=.025,segments=40,loc=(0,0),material='Metal'):
 return tube(name,[(loc[0]+r*cos(2*pi*i/segments),loc[1]+r*sin(2*pi*i/segments),z) for i in range(segments+1)],thick,col,parent,8,material)

def crystal(name,loc,r,h,col,parent,sides=6):
 vs=[]
 for z,rad in [(0,r*.65),(.18*h,r),(.70*h,r*.87),(h,0)]:
  for i in range(sides):a=2*pi*i/sides;vs.append((loc[0]+rad*cos(a),loc[1]+rad*sin(a),loc[2]+z))
 fs=[]
 for j in range(3):
  for i in range(sides):k=j*sides+i;n=j*sides+(i+1)%sides;fs.append((k,n,n+sides,k+sides))
 return mesh(name,vs,fs,col,parent,'Glow',False)

def box(name,loc,scale,col,parent,bevel=.02,material='Organic'):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=parent
 if bevel:
  mod=o.modifiers.new('Hand rounded edges','BEVEL');mod.width=bevel;mod.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.append(mat(material));a=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for v in a.data:v.color=col
 for p in o.data.polygons:p.use_smooth=True
 return o

def flower(loc,parent,scale=.07):
 for i in range(5):
  a=2*pi*i/5;leaf('FlowerPetal',loc,(loc[0]+scale*cos(a),loc[1]+scale*sin(a),loc[2]+scale*.3),scale*.30,CREAM,parent,.025)
 ellipsoid('Pollen',loc,(scale*.25,scale*.25,scale*.2),BRASS,parent,8,4)

def base(root,tier):
 from sculpt_carrot_details import tower_base
 return tower_base(root,tier,root.name.rsplit('-',1)[0])

def stalk(parent,z=.85):
 from sculpt_carrot_details import tower_stalk
 tower_stalk(parent,z,CURRENT_KIND)

def barrel(parent,loc,r=.115,length=.52):
 # Distinct hollow bore with bronze flange and rifled inner wall, pointing -Y.
 profile=[(r*.7,0),(r,.04),(r,length*.72),(r*1.15,length*.86),(r*1.15,length),(r*.72,length),(r*.66,length-.10),(r*.6,.05)]
 o=lathe('CannonBore',profile,GOLD,parent,segments=24,material='Metal');o.rotation_euler.x=pi/2;o.location=loc
 for d in [.06,length*.65,length*.88]:
  rr=ring('BarrelBand',r*1.06,d,BRASS,parent,.018,24);rr.rotation_euler.x=pi/2;rr.location=loc
 return o

def star_mesh(name,loc,r,col,parent,depth=.08,angle=0):
 vs=[]
 for y in [-depth/2,depth/2]:
  for i in range(10):a=pi/2+i*pi/5+angle;rr=r if i%2==0 else r*.43;vs.append((loc[0]+rr*cos(a),loc[1]+y,loc[2]+rr*sin(a)))
 fs=[tuple(range(9,-1,-1)),tuple(range(10,20))]+[(i,(i+1)%10,(i+1)%10+10,i+10) for i in range(10)]
 return mesh(name,vs,fs,col,parent,'Metal',False)

def tower(kind,t):
 global CURRENT_KIND
 CURRENT_KIND=kind
 clear();root=empty(kind+'-'+str(t));base(root,t);turret=empty('Turret',root);core=empty('Core',turret);petals=empty('Petals',turret);muzzle=empty('Muzzle',turret,(0,-.40,1.0));top=1.10+.10*(t-1)
 if kind=='seed':
  stalk(turret,.58);box('Saddle',(0,0,.60),(.40,.26,.12),GOLD,turret,.035,'Metal');bar=empty('Barrel',turret)
  count=1 if t<3 else t-1
  for i in range(count):barrel(bar,((i-(count-1)/2)*.23,.12,.80+(.04 if t==4 and i==1 else 0)),.115 if t<3 else .10,.52+.035*t)
  lathe('SeedHopper',[(.10,0),(.17,.19),(.21,.22)],BARK,turret,(0,.17,.74),20)
  for j in range(10+t*3):
   a=j*2.399;r=.15*sqrt((j+.5)/(10+t*3));ellipsoid('Seed',(r*cos(a),.17+r*sin(a),.98+random.random()*.06),(.025,.028,.04),DARK,turret,8,5)
  for side in [-1,1]:
   leaf('LeafShield',(side*.15,.11,.55),(side*(.28+.025*t),-.05,1.05),.12,LEAF,petals,.04)
   if t>=2:box('RecoilGear',(side*.23,.02,.72),(.035,.19,.19),BRASS,turret,.025,'Metal')
  if t==4:
   for i in range(5):a=pi*i/4;leaf('CrownLeaf',(.20*cos(a),.12,.90),(.31*cos(a),.14,1.21+.12*sin(a)),.065,BRASS,petals,.03,'Metal')
 elif kind=='frost':
  stalk(turret,.76);ring('BudCollar',.15,.74,BRASS,turret,.035)
  n=4+t*2
  for i in range(n):
   a=2*pi*i/n;leaf('IcePetal',(.04*cos(a),.04*sin(a),.77),((.15+.045*t)*cos(a),(.15+.045*t)*sin(a),1.02+.03*t),.075,ICE,petals,.16,'Glow')
  crystal('IceHeart',(0,0,.80),.11+.015*t,.45,ICE,core)
  if t>=2:
   for i in range(t+1):a=i*2*pi/(t+1);crystal('IceSatellite',(.25*cos(a),.25*sin(a),.65),.045,.27,ICE,turret)
  if t>=3:
   r=empty('Ring01',turret);ring('GoldHalo',.33,1.03,BRASS,r,.015)
  if t==4:
   r=empty('Ring02',turret);ring('IceOrbit',.43,1.2,ICE,r,.018,material='Glow')
   for a in [0,2.1,4.2]:ellipsoid('SnowPearl',(.43*cos(a),.43*sin(a),1.2),(.055,)*3,ICE,r,12,8,'Glow')
 elif kind=='mortar':
  for a in [0,2*pi/3,4*pi/3]:tube('MortarLeg',[(.12*cos(a),.12*sin(a),.52),(.31*cos(a),.31*sin(a),.32),(.34*cos(a),.34*sin(a),.19)],[.075,.10,.055],BARK,turret,10)
  col=(.58,.23,.09,1) if t<4 else GOLD
  lathe('OpenMortarPot',[(.13,.38),(.25,.45),(.31,.62),(.30,.87),(.28,.98),(.22,.98),(.22,.87),(.20,.55),(.08,.50)],col,turret,segments=36,material='Metal' if t==4 else 'Organic',lobes=10 if t==4 else 0)
  ring('PotRim',.28,.96,BRASS,turret,.04)
  for a in [0,pi/2,pi,3*pi/2]:tube('IronStrap',[(.14*cos(a),.14*sin(a),.40),(.32*cos(a),.32*sin(a),.61),(.30*cos(a),.30*sin(a),.88)],[.025]*3,GOLD,turret,6,'Metal')
  if t>=2:
   for a in [0,pi]:ring('PotHandle',.095,.74,GOLD,turret,.025,20,(.35*cos(a),0))
  if t>=3:ellipsoid('SeedShell',(0,0,.86),(.18,.18,.21),GREEN,core,20,12);tube('Fuse',[(0,0,1.04),(.03,0,1.13),(.08,0,1.16)],[.019,.018,.007],BRASS,core)
  if t==4:
   for a in [pi/4,3*pi/4,5*pi/4,7*pi/4]:leaf('PumpkinFin',(.18*cos(a),.18*sin(a),.70),(.42*cos(a),.42*sin(a),1.02),.08,BRASS,petals,.07,'Metal')
  muzzle.location=(0,0,1.12)
 elif kind=='prism':
  stalk(turret,.88)
  for i in range(3+t):a=2*pi*i/(3+t);tube('CrystalProng',[(.07*cos(a),.07*sin(a),.60),(.23*cos(a),.23*sin(a),.93),(.18*cos(a),.18*sin(a),1.03)],[.035,.025,.01],GOLD,turret,7,'Metal')
  crystal('FloatingPrism',(0,0,.96),.13+.018*t,.39+.04*t,VIOLET if t<4 else (.84,.68,.36,1),core)
  if t>=2:
   for a in [0,2*pi/3,4*pi/3]:crystal('MinorPrism',(.23*cos(a),.23*sin(a),.70+.03*t),.045+.005*t,.23,VIOLET,turret)
  if t>=3:
   r=empty('Ring01',turret);ring('RuneHalo',.31,1.11,GOLD,r,.014)
  if t==4:
   for i in range(8):a=pi*i/4;leaf('CrownPetal',(.12*cos(a),.12*sin(a),1.02),(.31*cos(a),.31*sin(a),1.34),.043,BRASS,petals,.08,'Metal')
 elif kind=='storm':
  # Bells hang inside grown wooden antlers; each is an independent swing pivot.
  for s in [-1,1]:tube('Antler',[(s*.23,0,.20),(s*.23,0,.78),(s*.31,0,1.10),(s*.10,0,1.28)],[.09,.065,.045,.01],BARK,turret,10)
  tube('BellBeam',[(-.28,0,1.10),(0,0,1.17),(.28,0,1.10)],[.05,.06,.05],GOLD,turret,8,'Metal')
  for i in range(1 if t==1 else 3):
   x=0 if t==1 else (i-1)*.22;bell=empty('Bell0'+str(i+1),turret,(x,0,1.10));lathe('CastBell',[(.025,-.02),(.065,-.10),(.07,-.25),(.13,-.34),(.13,-.38),(.105,-.38),(.045,-.10)],BRASS,bell,segments=24,material='Metal');ellipsoid('Clapper',(0,0,-.36),(.025,)*3,DARK,bell,10,6)
  if t>=2:
   tube('CopperCoil',[(.13*cos(i*.45),.13*sin(i*.45),.32+i*.009) for i in range(60)],.012,BRASS,turret,6,'Metal')
  if t>=3:crystal('SkyCrystal',(0,0,1.23),.09,.30,ICE,core)
  if t==4:
   for s in [-1,1]:tube('ConductiveAntler',[(s*.24,0,1),(s*.42,0,1.31),(s*.32,0,1.50)],[.035,.025,.004],BRASS,turret,7,'Metal');crystal('Pendant',(s*.34,0,.79),.046,.20,ICE,turret)
 elif kind=='blossom':
  stalk(turret,.96);head=empty('FlowerHead',turret,(0,0,.90));head.rotation_euler.x=.32
  rings=1 if t==1 else (2 if t<4 else 3)
  for j in range(rings):
   for i in range(7+t*2):
    a=2*pi*(i+.45*j)/(7+t*2);r=.23+.075*j+.02*t
    leaf('SunPetal',(.07*cos(a),.07*sin(a),.04),(r*cos(a),r*sin(a),.18 if t==1 else .09-.02*j),.07,(.95,.60+.06*j,.10,1),head,.15 if t==1 else .065)
  ellipsoid('PollenDisk',(0,0,.075),(.12+.01*t,.12+.01*t,.075),BARK,core,24,12)
  core.location=head.location
  for i in range(28+t*8):
   a=i*2.399;r=(.10+.01*t)*sqrt(i/(28+t*8));ellipsoid('SpiralSeed',(r*cos(a),r*sin(a),.14),(.013,.013,.014),BRASS,core,6,4)
  for s in [-1,1]:leaf('StemLeaf',(0,0,.46),(s*.38,.02,.78),.12,GREEN,petals,.14)
  if t==4:
   for s in [-1,1]:tube('FlowerBranch',[(0,0,.4),(s*.3,.12,.55),(s*.32,.12,.90)],[.036,.025,.009],GREEN,turret);flower((s*.32,.12,.92),turret,.15)
 elif kind=='starfruit':
  stalk(turret,.75);lathe('StarPedestal',[(.18,.62),(.22,.72),(.17,.79)],GOLD,turret,segments=24,material='Metal');star_mesh('Starfruit',(0,0,1.03),.25+.025*t,(.98,.71,.12,1),core,.12);ellipsoid('StarSeed',(0,-.08,1.04),(.058,.025,.058),(.98,.34,.07,1),core,12,8,'Glow')
  for j in range(t):
   a=2*pi*j/max(t,1)+.4;star_mesh('OrbitStar',(.34*cos(a),.10*sin(a),1.02+.24*sin(a)),.09,BRASS,petals,.045,a)
  if t>=2:r=empty('Ring01',turret);ring('StarOrbit',.32,.89,BRASS,r,.017)
  if t>=3:
   for a in [0,2.1,4.2]:leaf('StarLeaf',(.10*cos(a),.10*sin(a),.65),(.35*cos(a),.35*sin(a),.91),.06,BRASS,turret,.05,'Metal')
  if t==4:r=empty('Ring02',turret);ring('SecondOrbit',.43,1.15,BRASS,r,.012)
 elif kind=='gravity':
  stalk(turret,.65)
  for a in [0,2.1,4.2]:tube('GravityClaw',[(.10*cos(a),.10*sin(a),.56),(.27*cos(a),.27*sin(a),.83),(.25*cos(a),.25*sin(a),1.01)],[.05,.035,.015],GOLD,turret,8,'Metal')
  ellipsoid('Singularity',(0,0,1.01),(.14+.02*t,)*3,(.012,.008,.023,1),core,24,16)
  for j in range(1+t):
   r=empty('Ring0'+str(j+1),turret,(0,0,1.01));ring('Accretion',.19+j*.042,0,(.49+.08*j,.21,.82,1),r,.014+(.003*j),48,material='Glow');r.rotation_euler=(.18*j,.24*j,.1)
  if t>=3:
   for a in [0,1.57,3.14,4.71]:crystal('VoidAnchor',(.32*cos(a),.32*sin(a),.51),.065,.32,VIOLET,turret)
  if t==4:
   for i in range(7):a=i*.9;ellipsoid('OrbitDebris',(.42*cos(a),.42*sin(a),1.08+.10*sin(a*3)),(.035,.04,.055),STONE,petals,8,5)
 elif kind=='book':
  stalk(turret,.74);lathe('ReadingPlinth',[(.22,.69),(.27,.76),(.21,.83)],GOLD,turret,segments=32,material='Metal');pages=empty('Pages',turret,(0,0,1.02));pages.rotation_euler.x=.32
  for side in [-1,1]:
   cover=box('LeatherCover',(side*.15,0,-.035),(.31,.39,.05),(.19,.07,.045,1),pages,.015);cover.rotation_euler.y=side*.15
   for j in range(6+t):
    vs=[]
    for row in range(3):
     y=(row-1)*.18
     for i in range(7):x=side*(.025+i*.046);z=.02+j*.009+.04*sin(pi*i/6);vs.append((x,y,z))
    fs=[]
    for row in range(2):
     for i in range(6):k=row*7+i;fs.append((k,k+1,k+8,k+7))
    mesh('Parchment',vs,fs,CREAM,pages,smooth=True)
   for row in range(5):tube('EngravedRune',[(side*.07,-.12+row*.05,.09),(side*.13,-.12+row*.05,.098),(side*.21,-.12+row*.05,.085)],[.004]*3,GOLD,pages,4)
  tube('BookSpine',[(0,-.20,0),(0,0,.035),(0,.20,0)],.032,BRASS,pages,8,'Metal')
  crystal('Bookmark',(0,-.22,.93),.035,.13,VIOLET,core)
  if t>=2:
   for s in [-1,1]:tube('CandleStand',[(s*.30,.12,.65),(s*.32,.12,1.00)],[.026,.02],GOLD,turret);lathe('Candle',[(.035,0),(.03,.16)],CREAM,turret,(s*.32,.12,1.0),12);ellipsoid('CandleFlame',(s*.32,.12,1.20),(.025,.025,.055),(.98,.51,.08,1),turret,12,8,'Glow')
  if t>=3:r=empty('Ring01',turret);ring('RuneCircle',.33,1.34,BRASS,r,.012)
  if t==4:
   for a in [0,2.1,4.2]:box('FloatingRunePage',(.36*cos(a),.36*sin(a),1.32),(.12,.02,.17),CREAM,petals,.007)
 elif kind=='thunder':
  lathe('StormPylon',[(.18,.22),(.14,.31),(.10,.76),(.17,.85)],GOLD,turret,segments=24,material='Metal');tube('Coil',[(.15*cos(i*.5),.15*sin(i*.5),.30+i*.009) for i in range(55+t*6)],.014,BRASS,turret,6,'Metal')
  for j in range(4+t):a=j*2.4;ellipsoid('Cloud',(.18*cos(a),.13*sin(a),1.10+.08*sin(a*2)),(.21,.17,.14),(.49,.59,.64,1),core,16,10)
  for j in range(t):
   x=(j-(t-1)/2)*.13;tube('LightningRod',[(x,0,.65),(x,0,1.02),(x,0,1.37+.08*(j%2))],[.026,.025,.006],BRASS,turret,8,'Metal');ellipsoid('RodTip',(x,0,1.38+.08*(j%2)),(.035,)*3,ICE,turret,10,6,'Glow')
  if t>=2:
   for s in [-1,1]:crystal('Capacitor',(s*.28,0,.49),.067,.34,ICE,turret)
  if t>=3:r=empty('Ring01',turret);ring('ConductiveHalo',.32,.85,BRASS,r,.025)
  if t==4:
   for a in [0,2.1,4.2]:tube('StormFin',[(.14*cos(a),.14*sin(a),.32),(.35*cos(a),.35*sin(a),.57),(.38*cos(a),.38*sin(a),.94)],[.05,.035,.007],GOLD,turret,8,'Metal')
 from sculpt_carrot_details import add_tower_detail
 add_tower_detail(kind,t,root)
 export(root,kind+'-'+str(t))

def carrot():
 clear();root=empty('Carrot');body=empty('Body',root)
 profile=[]
 for j in range(47):
  u=j/46;z=.12+u*.85;r=.025+.285*sin(pi*u*.82)**.82;r*=1-.033*(.5+.5*cos(u*2*pi*9+.5*sin(u*18)))**7;profile.append((r,z))
 skin=lathe('CarrotSkin',profile,(.96,.33,.055,1),body,segments=64,lobes=0)
 for v in skin.data.vertices:
  p=v.co;a=math.atan2(p.y,p.x);p.x+=.012*sin(p.z*8)+.006*cos(a*7+p.z*28);p.y+=.008*sin(a*5+p.z*32)
 for j in range(25):
  a=-pi/2+random.uniform(-1.3,1.3);z=random.uniform(.28,.87);u=(z-.12)/.85;r=.025+.285*sin(pi*u*.82)**.82
  tube('NaturalSkinScar',[(r*cos(a+k*.03),r*sin(a+k*.03)-.003,z+.002*sin(k)) for k in range(random.randint(3,7))],.0017,(.57,.15,.024,1),body,5)
 # Physical fine lateral growth wrinkles, root hairs and orange cheek volume.
 for j in range(8):
  z=.26+j*.075;r=.11+.20*sin(pi*((z-.12)/.85)*.82)**.7
  a0=-pi/2-.25+(.3 if j%2 else 0);tube('GrowthWrinkle',[(r*cos(a0+i*.055),r*sin(a0+i*.055)-.005,z+.004*sin(i)) for i in range(8)],.0035,(.62,.17,.03,1),body,5)
 for s in [-1,1]:
  ellipsoid('Cheek',(s*.22,-.246,.54),(.070,.025,.05),(.99,.40,.12,1),body,14,8)
  tube('RootWhisker',[(s*.075,0,.17),(s*.12,-.015,.12),(s*.16,-.035,.14)],[.012,.006,.001],(.86,.32,.09,1),body,6)
 leaves=empty('Leaves',root,(0,0,.92))
 for i in range(9):
  a=2*pi*i/9;l=.37+.12*(i%3);start=(.025*cos(a),.025*sin(a),0);end=(.28*cos(a),.28*sin(a),l)
  tube('LeafStalk',[start,(.12*cos(a),.12*sin(a),l*.6),end],[.025,.016,.003],GREEN,leaves,7)
  for j in range(5):
   t=.28+j*.14;mid=(end[0]*t,end[1]*t,end[2]*t)
   for s in [-1,1]:ang=a+s*.65;leaf('CarrotLeaf',mid,(mid[0]+.13*cos(ang),mid[1]+.13*sin(ang),mid[2]+.10),.042,LEAF if j%2 else GREEN,leaves,.04)
 eyes=empty('Eyes',root)
 for s,n in [(-1,'EyeL'),(1,'EyeR')]:
  eye=empty(n,eyes,(s*.12,-.275,.69));ellipsoid('EyeWhite',(0,0,0),(.088,.036,.105),(.98,.94,.83,1),eye,20,14);ellipsoid('Iris',(0,-.034,-.005),(.053,.018,.073),(.27,.11,.025,1),eye,20,12);ellipsoid('Pupil',(0,-.049,-.002),(.03,.008,.048),DARK,eye,18,12);ellipsoid('Catchlight',(-.014,-.057,.026),(.015,.007,.022),(1,1,1,1),eye,10,6)
 brows=empty('Brows',root)
 for s,n in [(-1,'BrowL'),(1,'BrowR')]:
  b=empty(n,brows,(s*.12,-.27,.81));tube('ExpressiveBrow',[(-.064,0,-.004),(0,-.015,.02),(.060,0,.01)],[.013,.018,.009],(.30,.075,.018,1),b,7)
 for name,pts,r in [('MouthSmile',[(-.068,-.315,.50),(0,-.33,.472),(.068,-.315,.51)],.013),('MouthHurt',[(-.058,-.315,.49),(0,-.33,.52),(.058,-.315,.49)],.016),('MouthHappy',[(-.075,-.315,.51),(0,-.34,.445),(.075,-.315,.51)],.023)]:tube(name,pts,r,DARK,root,9)
 for s,n in [(-1,'ArmL'),(1,'ArmR')]:
  arm=empty(n,root,(s*.27,0,.48));tube('Arm',[(0,0,0),(s*.07,-.025,-.08),(s*.11,-.05,-.05)],[.04,.035,.045],(.91,.31,.045,1),arm,10);ellipsoid('Hand',(s*.11,-.05,-.05),(.055,.04,.045),(.98,.40,.085,1),arm)
 for s,n in [(-1,'FootL'),(1,'FootR')]:ellipsoid(n,(s*.115,-.035,.10),(.086,.115,.07),(.77,.24,.028,1),root)
 bite=empty('BitePatch',root,(.30,-.07,.59))
 for j in range(5):a=2*pi*j/5;ellipsoid('BiteDent',(.035*cos(a),-.02,.04*sin(a)),(.04,.02,.036),(.99,.72,.29,1),bite,12,8)
 export(root,'Carrot')

def join_parts():
 # Preserve intentional named pivots, consolidate only mesh siblings by material.
 groups={}
 for o in list(bpy.context.scene.objects):
  if o.type=='MESH' and o.name not in {'MouthSmile','MouthHurt','MouthHappy','FootL','FootR'} and not o.modifiers and o.parent and o.parent.type=='EMPTY':groups.setdefault((o.parent.name,o.data.materials[0].name if len(o.data.materials) else ''),[]).append(o)
 for (p,m),obs in groups.items():
  if len(obs)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=p+'_'+m

def export(root,name,animated=False):
 if not animated:join_parts()
 for ob in bpy.context.scene.objects:
  if ob.type!='MESH' or ob.data.uv_layers:continue
  uv=ob.data.uv_layers.new(name='UVMap')
  for poly in ob.data.polygons:
   axis=max(range(3),key=lambda i:abs(poly.normal[i]));axes=[i for i in range(3) if i!=axis]
   for li in poly.loop_indices:
    co=ob.data.vertices[ob.data.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]],co[axes[1]])
 bpy.ops.object.select_all(action='SELECT')
 for o in list(bpy.context.selected_objects):
  if o.type not in {'MESH','EMPTY','ARMATURE'}:o.select_set(False)
 bpy.context.scene.frame_set(0)
 path=OUT/(name+'.fbx')
 # Unity preserves FBX COLOR bytes; CarrotModels flags these materials for
 # sRGB-to-linear decoding in Storybook. Keep this export convention explicit.
 bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'EMPTY','MESH','ARMATURE'},axis_forward='-Z',axis_up='Y',add_leaf_bones=False,bake_anim=animated,bake_anim_use_all_actions=animated,bake_anim_use_nla_strips=False,bake_anim_force_startend_keying=True,bake_anim_simplify_factor=0,mesh_smooth_type='FACE',use_mesh_modifiers=True,colors_type='SRGB',path_mode='COPY',embed_textures=True)
 tri=sum(len(p.vertices)-2 for o in bpy.context.scene.objects if o.type=='MESH' for p in o.data.polygons)
 manifest.append({'name':name,'triangles':tri,'animated':animated,'meshes':sum(o.type=='MESH' for o in bpy.context.scene.objects),'clips':[a.name for a in bpy.data.actions] if animated else []})
 print('ASSET_READY',name,'triangles',tri,flush=True)

if __name__=='__main__':
 import sys
 mode=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'original'
 if mode in ['original','priority']:
  carrot()
  for k in (['seed','frost'] if mode=='priority' else ['seed','frost','mortar','prism','storm','blossom','starfruit','gravity','book','thunder']):
   for t in range(1,5):tower(k,t)
  (ROOT/'Tools/original-model-manifest.json').write_text(json.dumps(manifest,indent=2))
