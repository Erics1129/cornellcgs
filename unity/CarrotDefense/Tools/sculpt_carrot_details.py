"""Continuous organic surfaces and specifically authored boss anatomy.
The mesh detail is real geometry: swept roots, fused muscle masses, curved fur,
carved plates, glass lantern cages and curling tentacles with physical suckers.
"""
import bpy,math,random
from mathutils import Vector
from math import sin,cos,pi
import build_carrot_models as g
R=random.Random(9021)

def whiten(ob):
 a=ob.data.color_attributes.get('Color')
 if a:
  for c in a.data:c.color=(1,1,1,1)

def barkplate(parent,x,y,ztop,length,width,angle=0):
 vs=[];fs=[];rows=8;columns=5
 for j in range(rows):
  t=j/(rows-1);w=width*(.52+.43*sin(pi*t))*(1-.6*t)
  for i in range(columns):
   u=(i/(columns-1)-.5)*2;xx=x+u*w*.5+sin(t*2)*angle;z=ztop-t*length+.013*sin(i*2.1+j);yy=y-.023*(1-u*u)-.025*sin(pi*t);vs.append((xx,yy,z))
 for j in range(rows-1):
  for i in range(columns-1):k=j*columns+i;fs.append((k,k+1,k+columns+1,k+columns))
 o=g.mesh('GrownFacePlate',vs,fs,g.BARK,parent,'Bark');mod=o.modifiers.new('Bark thickness','SOLIDIFY');mod.thickness=.028;mod.offset=0;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def curve(pts,steps=5):
 p=[Vector(x) for x in pts];out=[]
 for i in range(len(p)-1):
  a=p[max(0,i-1)];b=p[i];c=p[i+1];d=p[min(len(p)-1,i+2)]
  for j in range(steps):
   t=j/steps;out.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)))
 out.append(tuple(p[-1]));return out

def branch(name,pts,radius,parent,col=g.BARK,grooves=True):
 p=curve(pts,5);n=len(p);r=[radius*(1-i/(n+.5))**.75+.004 for i in range(n)]
 category='Metal' if col in [g.GOLD,g.BRASS] else 'Glow' if col==g.ICE else 'Bark' if col in [g.BARK,g.WOOD] else 'Organic'
 ob=g.tube(name,p,r,col,parent,12,category)
 # Structural longitudinal fibers follow bends, with different phase and width.
 if grooves:
  for j in range(5):
   a=j*2*pi/5;line=[]
   for i,pt in enumerate(p):
    tang=Vector(p[min(n-1,i+1)])-Vector(p[max(0,i-1)]);tang.normalize();normal=tang.cross(Vector((0,1,0)))
    if normal.length<.01:normal=Vector((1,0,0))
    normal.normalize();side=tang.cross(normal);aa=a+.22*sin(i*.34+j);line.append(tuple(Vector(pt)+(normal*cos(aa)+side*sin(aa))*r[i]*.94))
   g.tube('BarkFiber',line,[max(.002,.012*(1-i/n)) for i in range(n)],tuple(c*.70 for c in col[:3])+(1,),parent,5)
 return ob

def roughstone(name,loc,scale,parent,col=g.STONE):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=loc);o=bpy.context.object;o.name=name;o.parent=parent
 for v in o.data.vertices:
  q=v.co;fac=1+.14*sin(q.x*8+q.y*5)+.09*sin(q.z*11-q.x*4);q.x*=scale[0]*fac;q.y*=scale[1]*fac;q.z*=scale[2]*fac
 o.data.materials.append(g.mat('Stone'));a=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for p in o.data.polygons:
  color=tuple(c*(.88+.10*R.random()) for c in col[:3])+(1,)
  for li in p.loop_indices:a.data[li].color=color
 mod=o.modifiers.new('Worn fracture edges','BEVEL');mod.width=min(scale)*.08;mod.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def fuse(name,objects,parent,col,voxel=.035):
 bpy.ops.object.select_all(action='DESELECT')
 for ob in objects:ob.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=objects[0];o.name=name
 mod=o.modifiers.new('Continuous sculpted anatomy','REMESH');mod.mode='VOXEL';mod.voxel_size=voxel;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('Anatomical blending','SMOOTH');mod.factor=.62;mod.iterations=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('Surface budget','DECIMATE');mod.ratio=.68;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.clear();o.data.materials.append(g.mat('Organic'));a=o.data.color_attributes.get('Color') or o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for p in o.data.polygons:
  p.use_smooth=True
  for li in p.loop_indices:a.data[li].color=col
 return o

def eyelid(parent,x,y,z,size,col,glow):
 # An eye is recessed in a dark socket and covered by a sloping upper lid.
 g.ellipsoid('EyeSocket',(x,y,z),(size*1.30,.033,size*.74),(.018,.025,.018,1),parent,24,12)
 g.ellipsoid('LivingEye',(x,y-.025,z),(size,.025,size*.47),glow,parent,24,12,'Glow')
 s=1 if x>0 else -1
 branch('CarvedBrow',[(x-s*size*1.2,y+.008,z+size*.70),(x,y-.025,z+size*.90),(x+s*size*1.3,y+.022,z+size*.85)],size*.50,parent,col,False)
 g.tube('LowerEyeLid',curve([(x-size*1.25,y+.002,z-size*.28),(x,y-.023,z-size*.60),(x+size*1.22,y+.002,z-size*.28)],5),size*.14,col,parent,7)

def lantern(parent,loc,scale=1):
 x,y,z=loc;r=.105*scale;h=.27*scale
 g.lathe('LanternGlass',[(r*.7,0),(r,.045*scale),(r*.85,h*.80),(r*.40,h)],(.26,.82,.60,1),parent,loc,20,'Glow')
 for i in range(6):
  a=2*pi*i/6;g.tube('LanternCage',curve([(x+r*.7*cos(a),y+r*.7*sin(a),z),(x+r*1.03*cos(a),y+r*1.03*sin(a),z+h*.32),(x+r*.42*cos(a),y+r*.42*sin(a),z+h)],4),.012*scale,g.GOLD,parent,6,'Metal')
 for zz,rr in [(z,r*.72),(z+h*.80,r*.71)]:g.ring('LanternRim',rr,zz,g.GOLD,parent,.016*scale,24,(x,y))
 g.lathe('LanternRoof',[(r*.78,0),(r*.8,.025*scale),(0,.085*scale)],g.GOLD,parent,(x,y,z+h*.83),20,'Metal')

def garden(parent):
 # The trunk has a crooked waist and a shoulder line that tilts; armor grows from
 # the root anatomy instead of sitting on a symmetrical spherical torso.
 trunk=branch('LivingTrunk',[(.03,.045,.30),(-.045,.02,.72),(.035,.06,1.10),(-.04,.01,1.50)],.35,parent,g.BARK,True)
 for side in [-1,1]:
  s=side;shoulder=(s*.30,.035,1.31+(.055 if s<0 else 0));elbow=(s*.54,-.015,1.01);wrist=(s*.64,-.12,.61)
  branch('TwistedArm',[shoulder,(s*.46,.045,1.24),elbow,(s*.62,-.075,.81),wrist],.23,parent,g.BARK)
  for j in range(3):branch('GraspingRoot',[wrist,(s*.67+(j-1)*.07,-.17,.47),(s*.65+(j-1)*.09,-.28,.38)],.05,parent,g.WOOD,False)
  branch('RootLeg',[(s*.15,0,.61),(s*.24,-.03,.34),(s*.23,-.15,.12)],.20,parent,g.BARK)
  for j in range(3):branch('GroundRoot',[(s*.22,-.02,.20),(s*.23+(j-1)*.10,-.20,.08),(s*.21+(j-1)*.13,-.43,.025)],.055,parent,g.BARK)
  for j in range(5):
   p=(s*(.29+j*.055),.05+.07*sin(j*1.8),1.42-j*.056);roughstone('FusedShoulderStone',p,(.18-.012*j,.20,.13+.018*(j%2)),parent,(.30,.33,.29,1))
   if j%2==0:branch('ArmorRoot',[(p[0]-.10,p[1],p[2]+.11),(p[0],p[1]-.17,p[2]+.03),(p[0]+.06,p[1]-.12,p[2]-.11)],.045,parent,g.BARK,False)
  # Curving antler trunks with forks growing at different depths.
  points=[(s*.14,.08,1.73),(s*.29,.08,1.98),(s*.41,.09,2.17),(s*.38,.06,2.43),(s*.47,.02,2.59)]
  branch('AncientAntler',points,.105,parent,g.BARK)
  for j in range(3):branch('AntlerFork',[(s*(.23+j*.075),.08,1.91+j*.17),(s*(.43+j*.09),.10+j*.025,2.04+j*.19),(s*(.49+j*.09),.06,2.27+j*.17)],.05-j*.007,parent,g.WOOD)
 # Curved bark slabs overlap down the trunk, not uniform cylindrical bands.
 for row in range(4):
  for j in range(5):
   a=2*pi*(j+.15*(row%2))/5;z=.65+row*.21;r=.27+.055*sin(row)
   g.leaf('BarkPlate',(r*cos(a),r*sin(a),z+.19),((r+.055)*cos(a+.10),(r+.055)*sin(a+.10),z-.16),.095,g.BARK,parent,.075,'Bark')
 head=fuse('CarvedRootFace',[g.ellipsoid('Skull',(-.025,-.02,1.63),(.25,.20,.27),g.BARK,parent,24,16),g.ellipsoid('Jaw',(-.025,-.12,1.46),(.18,.16,.17),g.BARK,parent,24,16)],parent,g.BARK,.025)
 head.data.materials.clear();head.data.materials.append(g.mat('Bark'))
 for s in [-1,1]:eyelid(parent,s*.095-.025,-.219,1.67,.055,g.WOOD,(1,.38,.035,1))
 branch('NoseRidge',[(-.025,-.20,1.71),(-.028,-.265,1.60),(-.04,-.245,1.54)],.045,parent,g.BARK,False)
 g.tube('MouthCrevice',curve([(-.13,-.225,1.48),(-.04,-.27,1.445),(.09,-.23,1.47)],4),.012,(.025,.015,.008,1),parent,6)
 # Glowing fractured heart set deep into surrounding bark ribs.
 g.ellipsoid('HeartCavity',(0,-.30,1.08),(.135,.038,.19),(.025,.015,.005,1),parent,20,12)
 for j in range(4):branch('HeartCrack',[(-.07+j*.045,-.34,.94),(R.uniform(-.07,.07),-.346,1.08),(R.uniform(-.10,.10),-.33,1.23)],.012,parent,(.96,.38,.04,1),False)
 for j in range(18):
  a=j*2.399;p=(.35*cos(a),.15*sin(a),1.28+.2*sin(a*.7));g.leaf('MossFrond',p,(p[0]+.11*cos(a),p[1]+.06*sin(a),p[2]-.23),.027,(.16,.30,.055,1),parent,.035)

def marsh(parent):
 body=fuse('LeviathanMantle',[g.ellipsoid('Mantle',(0,.045,1.09),(.43,.35,.61),(.08,.25,.28,1),parent,32,22),g.ellipsoid('LowerMantle',(-.015,-.07,.70),(.34,.29,.33),(.08,.25,.28,1),parent,28,18),g.ellipsoid('BrowMass',(0,-.18,1.23),(.36,.20,.20),(.08,.25,.28,1),parent,28,18)],parent,(.055,.23,.26,1),.025)
 body.data.materials.clear();body.data.materials.append(g.mat('Scale'));whiten(body)
 for j in range(8):
  a=j*2*pi/8+.13;span=1.02+(j%3)*.14;h=.20+(j%2)*.16
  pts=curve([(.22*cos(a),.22*sin(a),.77),(.49*cos(a+.16),.49*sin(a+.16),.44),(.86*cos(a+.20),.86*sin(a+.20),.23),(span*cos(a),span*sin(a),.37+h),((span+.05)*cos(a-.14),(span+.05)*sin(a-.14),.73+h),((span-.18)*cos(a-.23),(span-.18)*sin(a-.23),.85+h)],6)
  radius=[.165*(1-i/(len(pts)-.2))**.82+.004 for i in range(len(pts))];g.tube('SweptTentacle',pts,radius,(.055,.27,.30,1),parent,14)
  for k in range(3,len(pts)-4,3):
   p=Vector(pts[k]);t=(Vector(pts[k+1])-Vector(pts[k-1])).normalized();n=Vector((0,0,1));side=t.cross(n).normalized()
   for s in [-1,1]:
    q=p+n*radius[k]*.85+side*s*radius[k]*.44;rr=radius[k]*.27
    cup=g.lathe('TentacleSucker',[(rr*.7,0),(rr,.016),(rr*.88,.03),(rr*.5,.026),(rr*.35,.010)],(.48,.60,.38,1),parent,tuple(q),12)
 for s in [-1,1]:eyelid(parent,s*.155,-.337,1.25,.074,(.035,.17,.19,1),(.30,.86,.61,1))
 g.ellipsoid('BeakSocket',(0,-.32,.98),(.13,.04,.15),(.012,.025,.025,1),parent,20,12)
 for s in [-1,1]:branch('IvoryBeak',[(s*.075,-.32,1.08),(s*.10,-.38,.97),(s*.02,-.41,.85)],.037,parent,(.55,.63,.45,1),False)
 # Crown rests on the mantle; its open metalwork carries hanging glass lanterns.
 g.ring('CrownCollar',.275,1.57,g.GOLD,parent,.029,40)
 for j in range(5):
  a=j*2*pi/5;branch('GrownCrown',[(.26*cos(a),.26*sin(a),1.56),(.34*cos(a+.13),.34*sin(a+.13),1.89),(.26*cos(a+.24),.26*sin(a+.24),2.15)],.045,parent,g.GOLD,False)
 for j,a in enumerate([.2,2.30,4.3]):
  branch('LanternArm',[(.25*cos(a),.25*sin(a),1.70),(.40*cos(a),.40*sin(a),1.95),(.50*cos(a),.50*sin(a),1.87)],.027,parent,g.GOLD,False)
  lantern(parent,(.50*cos(a),.50*sin(a),1.48+.05*j),.85)
 for j in range(30):
  a=j*2.399;z=.85+(j%6)*.12;r=.38*math.sqrt(max(.08,1-((z-1.11)/.65)**2));g.ellipsoid('SkinNodule',(r*cos(a),r*.80*sin(a),z),(.014,.014,.018),(.13,.34,.33,1),parent,8,5)

def fur(parent,loc,direction,length,width,col):
 p=Vector(loc);d=Vector(direction).normalized();side=Vector((1,0,0));depth=d.cross(side).normalized();pts=curve([tuple(p-d*.035),tuple(p+d*length*.25+depth*.016),tuple(p+d*length*.72+depth*.008),tuple(p+d*length)],3);vs=[];fs=[];sides=8
 for j,point in enumerate(pts):
  t=j/(len(pts)-1);w=width*(.48+.55*sin(pi*t))*(1-t)**.55+.001
  for i in range(sides):
   a=2*pi*i/sides;v=Vector(point)+side*cos(a)*w+depth*sin(a)*w*.40;vs.append(tuple(v))
 for j in range(len(pts)-1):
  for i in range(sides):k=j*sides+i;n=j*sides+(i+1)%sides;fs.append((k,n,n+sides,k+sides))
 fs.append(tuple(range(sides-1,-1,-1)));g.mesh('SculptedFur',vs,fs,col,parent,'Fur')

def frost(parent):
 col=(.77,.83,.85,1);parts=[]
 parts += [g.ellipsoid('Chest',(0,.035,1.04),(.44,.28,.48),col,parent,32,22),g.ellipsoid('Trapezius',(0,.055,1.40),(.45,.26,.27),col,parent,28,18),g.ellipsoid('Abdomen',(0,-.015,.70),(.29,.24,.33),col,parent,28,18)]
 for s in [-1,1]:
  parts += [g.ellipsoid('Deltoid',(s*.40,.01,1.30),(.25,.24,.29),col,parent,24,16),g.tube('ArmMuscle',curve([(s*.40,.025,1.34),(s*.62,-.015,1.10),(s*.65,-.085,.83),(s*.61,-.20,.61)],5),[.21-(i/15)*.04 for i in range(16)],col,parent,14),g.ellipsoid('Knuckle',(s*.61,-.21,.62),(.20,.16,.17),col,parent,24,16),g.tube('LegMuscle',curve([(s*.16,.035,.62),(s*.22,-.03,.38),(s*.23,-.12,.15)],5),[.18-(i/10)*.028 for i in range(11)],col,parent,14),g.ellipsoid('Foot',(s*.23,-.20,.10),(.18,.25,.105),col,parent,24,16)]
 body=fuse('ContinuousYetiAnatomy',parts,parent,col,.027);body.data.materials.clear();body.data.materials.append(g.mat('Fur'));whiten(body)
 head=fuse('YetiSkull',[g.ellipsoid('Skull',(0,-.095,1.59),(.265,.24,.29),col,parent,28,20),g.ellipsoid('Jaw',(0,-.19,1.40),(.19,.18,.145),col,parent,28,18)],parent,col,.02)
 # Scowling expressive face, upper and lower jaws surround a real dark mouth.
 for s in [-1,1]:eyelid(parent,s*.098,-.302,1.65,.059,(.20,.34,.43,1),(.10,.67,.93,1))
 g.ellipsoid('Nose',(0,-.345,1.54),(.086,.045,.052),(.17,.28,.35,1),parent,20,12)
 g.ellipsoid('MouthCavity',(0,-.343,1.42),(.108,.028,.066),(.012,.018,.03,1),parent,24,12)
 for s in [-1,1]:branch('UpperFang',[(s*.073,-.362,1.47),(s*.080,-.38,1.38),(s*.045,-.38,1.34)],.026,parent,g.CREAM,False)
 # Directional fur flows down the anatomy; shoulders use longer dense masses.
 for j in range(95):
  a=j*2.399;z=.40+(j%13)*.083;r=(.29+.15*math.sin((z-.4)/1.1*pi));p=(r*cos(a),r*.67*sin(a),z)
  if p[1]<-.10 and z>1.34:continue
  fur(parent,p,(.18*cos(a),.05*sin(a),-1),.18+.06*(j%3),.053,col)
 for s in [-1,1]:
  for j in range(24):
   a=j*2.399;x=s*(.38+(j%5)*.054);z=1.37-(j//5)*.14;p=(x,.14*cos(a)-.045,z);fur(parent,p,(s*.22,-.1,-1),.25,.060,col)
  for j in range(4):
   p=(s*(.28+j*.11),.055+.025*(j%2),1.43-j*.045);cr=g.crystal('EmbeddedIceShoulder',p,.105-.009*j,.40+.1*(j%2),g.ICE,parent,5)
  branch('SweepingIceHorn',[(s*.16,.03,1.75),(s*.29,.045,1.98),(s*.36,.06,2.21),(s*.28,.03,2.35)],.10,parent,g.ICE,False)
  for j in range(3):branch('DarkClaw',[(s*.61+(j-1)*.075,-.31,.59),(s*.62+(j-1)*.08,-.37,.47)],.031,parent,(.22,.31,.36,1),False)
 for j in range(5):g.crystal('IceCrown',((j-2)*.081,.08,1.77),.046,.22+.12*(1-abs(j-2)/3),g.ICE,parent,5)

def build_boss(kind,parent):
 {'garden':garden,'marsh':marsh,'frost':frost}[kind](parent)
 if kind=='garden':
  for j in range(7):
   x=(j-3)*.066;y=-.16+.05*abs(j-3)/3;barkplate(parent,x,y,1.88+.04*sin(j*1.3),.23+.035*(j%3),.095,.008*sin(j))
  for s in [-1,1]:
   barkplate(parent,s*.175,-.185,1.73,.35,.125,s*.018)
   barkplate(parent,s*.085,-.224,1.53,.24,.10,s*.01)
   branch('RootCheekRidge',[(s*.21,-.14,1.77),(s*.21,-.205,1.62),(s*.13,-.26,1.48),(s*.07,-.22,1.31)],.043,parent,g.BARK)
   for j in range(2):branch('IrregularAntlerFork',[(s*(.22+j*.09),.11,1.99+j*.17),(s*(.28+j*.12),.26,2.16+j*.17),(s*(.20+j*.15),.27,2.35+j*.17)],.037,parent,g.BARK)
 elif kind=='marsh':
  for s in [-1,1]:
   # Raised mantle folds curve around sockets and lead into a beak-like muzzle.
   pts=curve([(s*.10,-.17,1.62),(s*.27,-.27,1.43),(s*.31,-.34,1.24),(s*.23,-.35,1.02),(s*.12,-.31,.89)],5)
   g.tube('MantleFold',pts,[.082*(1-i/23)+.018 for i in range(21)],(1,1,1,1),parent,12,'Scale')
   branch('HookedIvoryBeak',[(s*.083,-.33,1.12),(s*.125,-.41,1.02),(s*.11,-.47,.87),(s*.03,-.45,.79)],.045,parent,(.61,.65,.47,1),False)
  for j in range(3):
   a=j*2.1;branch('CrownFiligree',[(.18*cos(a),.18*sin(a),1.6),(.32*cos(a+.1),.32*sin(a+.1),1.77),(.25*cos(a+.3),.25*sin(a+.3),2.12)],.022,parent,g.GOLD,False)
 else:
  for s in [-1,1]:
   for row in range(5):
    z=1.42-row*.125
    for j in range(5):
     a=(j/4-.5)*pi;x=s*(.48+.085*cos(a));y=-.02+.22*sin(a);fur(parent,(x,y,z),(s*.18,-.08,-1),.21+.025*(j%3),.084,(1,1,1,1))
   for row in range(3):
    for j in range(5):
     a=(j/4-.5)*pi;p=(s*.24+.12*cos(a),-.10+.17*sin(a),.66-row*.12);fur(parent,p,(s*.1,-.13,-1),.18,.069,(1,1,1,1))
   for j in range(5):fur(parent,(s*(.10+j*.035),-.14,1.68-j*.038),(s*.28,-.08,-1),.18,.055,(1,1,1,1))
  g.tube('DarkUpperLip',curve([(-.095,-.353,1.45),(0,-.38,1.465),(.095,-.353,1.45)],5),.015,(.11,.18,.23,1),parent,8)
  g.tube('DarkLowerLip',curve([(-.082,-.35,1.39),(0,-.37,1.365),(.082,-.35,1.39)],5),.014,(.11,.18,.23,1),parent,8)


def tower_base(root,tier,kind):
 base=g.empty('Base',root)
 if kind=='seed':
  # A heavy worked oak firing platform, held together by iron shoes.
  for j in range(4):
   plank=g.box('OakPlatform',((j-1.5)*.22,0,.105),(.225,.77,.16),(.28,.12,.035,1),base,.018,'Bark');plank.rotation_euler.z=.025*sin(j)
   for y in [-.29,.29]:g.ellipsoid('IronRivet',((j-1.5)*.22,y,.193),(.023,.023,.012),(.22,.23,.21,1),base,10,6,'Metal')
  for x in [-.37,.37]:g.box('IronFoot',(x,0,.095),(.08,.81,.18),(.20,.23,.21,1),base,.018,'Metal')
  for s in [-1,1]:roughstone('GroundStone',(s*.35,.28,.08),(.10,.13,.07),base)
 elif kind in ['frost','prism']:
  for j in range(6):
   a=j*2.399;r=.10+.06*(j%4);roughstone('FracturedPlinth',(r*cos(a),r*sin(a),.11),(.25,.22,.14),base,(.36,.43,.47,1) if kind=='frost' else (.25,.28,.32,1))
  for j in range(5+tier):
   a=j*2*pi/(5+tier);g.crystal('GroundCrystal',(.36*cos(a),.33*sin(a),.12),.037+.009*(j%2),.11+.06*(j%3),g.ICE if kind=='frost' else g.VIOLET,base)
 elif kind=='mortar':
  # A three-foot masonry cradle sunk into a soil berm.
  g.lathe('ClayBerm',[(.28,.015),(.41,.08),(.39,.16),(.25,.20)],(.30,.18,.07,1),base,segments=27,lobes=7)
  for j in range(3):a=j*2*pi/3;roughstone('CradleStone',(.33*cos(a),.33*sin(a),.13),(.20,.19,.15),base,(.39,.31,.25,1))
 elif kind in ['blossom','starfruit']:
  g.lathe('LivingSoil',[(.30,.015),(.43,.075),(.42,.15),(.28,.21)],(.23,.12,.045,1),base,segments=32,lobes=5)
  for j in range(9):
   a=j*2.399;g.leaf('GroundLeaf',(.13*cos(a),.13*sin(a),.17),(.49*cos(a),.45*sin(a),.20+.06*(j%3)),.075,(.16,.33,.055,1),base,.08)
  for j in range(5):a=j*2.4;g.flower((.34*cos(a),.34*sin(a),.22),base,.045)
 elif kind=='gravity':
  # Three dark monoliths brace the singularity emitter.
  for j in range(3):
   a=j*2*pi/3;stone=roughstone('VoidMonolith',(.24*cos(a),.24*sin(a),.16),(.21,.18,.20),base,(.10,.13,.17,1))
   g.tube('VioletFault',[(.24*cos(a),.24*sin(a)-.12,.08),(.26*cos(a),.24*sin(a)-.13,.21),(.23*cos(a),.24*sin(a)-.1,.30)],.008,(.49,.12,.80,1),base,5,'Glow')
 elif kind=='book':
  g.lathe('LibraryStone',[(.35,.02),(.42,.075),(.41,.12),(.32,.18)],(.31,.31,.29,1),base,segments=8)
  for s in [-1,1]:g.box('CarvedFoot',(s*.26,.06,.16),(.14,.35,.14),(.27,.13,.05,1),base,.03,'Bark')
  for a in [0,pi/2,pi,3*pi/2]:g.star_mesh('InlaidRune',(.30*cos(a),.30*sin(a),.15),.05,g.BRASS,base,.012,a)
 else:
  # Conductors stand on cut stone with separate porcelain/metal anchor feet.
  for j in range(4):
   a=pi/4+j*pi/2;roughstone('ConductiveBaseStone',(.22*cos(a),.22*sin(a),.10),(.23,.20,.11),base,(.31,.34,.35,1))
   g.lathe('AnchorInsulator',[(.045,0),(.064,.025),(.05,.06),(.065,.08),(.04,.13)],g.CREAM,base,(.30*cos(a),.30*sin(a),.16),14)
 return base

def tower_stalk(parent,z,kind):
 if kind=='seed':
  for s in [-1,1]:
   g.box('CannonCheek',(s*.19,0,.37),(.11,.33,.37),(.27,.12,.035,1),parent,.04,'Bark');g.ellipsoid('Trunnion',(s*.235,0,.59),(.045,.095,.095),(.39,.29,.15,1),parent,20,12,'Metal')
 elif kind=='frost':
  branch('FrostRoot',[(0,0,.14),(-.05,.035,.38),(.055,0,.60),(0,0,z)],.11,parent,(.31,.39,.40,1),False)
  for s in [-1,1]:g.crystal('StemIce',(s*.08,.015,.32),.055,.34,g.ICE,parent)
 elif kind=='prism':
  for s in [-1,1]:branch('PrismRoot',[(s*.18,.04,.15),(s*.16,.01,.43),(s*.06,-.01,z)],.105,parent,(.18,.15,.13,1))
 elif kind=='book':
  g.lathe('CarvedLectern',[(.18,.16),(.15,.23),(.085,.32),(.065,.57),(.14,z)],(.23,.09,.026,1),parent,segments=20,lobes=5)
 elif kind=='gravity':
  g.lathe('GravityPylon',[(.19,.20),(.13,.28),(.10,z-.1),(.19,z)],(.14,.15,.19,1),parent,segments=12,lobes=3)
 elif kind in ['blossom','starfruit']:
  branch('LivingStem',[(0,0,.15),(-.04,.025,.40),(.07,.015,z*.75),(0,0,z)],.095,parent,(.12,.31,.04,1),False)
 else:branch('WornStalk',[(.02,0,.14),(-.06,.02,.44),(.04,0,z)],.12,parent,g.BARK)

def add_tower_detail(kind,t,root):
 turret=next((o for o in root.children if o.name=='Turret'),root)
 if kind=='seed':
  # A cast breech block, barrel reinforcement, engraved seams and real fasteners.
  for s in [-1,1]:
   for z in [.38,.54]:g.ellipsoid('SteelFastener',(s*.256,-.08,z),(.018,.025,.025),(.20,.22,.22,1),turret,12,8,'Metal')
  g.box('Breech',(0,.22,.79),(.30,.20,.22),(.37,.28,.14,1),turret,.04,'Metal')
  for j in range(12):
   a=j*2*pi/12;g.ellipsoid('CastRivet',(.13*cos(a),-.415,.80+.13*sin(a)),(.013,.012,.013),g.BRASS,turret,8,5,'Metal')
 elif kind=='frost':
  petals=next((o for o in turret.children if o.name=='Petals'),turret)
  for j in range(5+t):
   a=2*pi*j/(5+t);g.tube('IcePetalVein',curve([(.04*cos(a),.04*sin(a),.80),(.15*cos(a),.15*sin(a),.98),((.18+.035*t)*cos(a),(.18+.035*t)*sin(a),1.06)],4),.010,(.68,.90,.96,1),petals,6,'Glow')
 elif kind=='starfruit':
  core=next((o for o in turret.children if o.name=='Core'),turret)
  for o in list(core.children):
   if o.name.startswith('Starfruit') or o.name.startswith('StarSeed'):bpy.data.objects.remove(o,do_unlink=True)
  # A real five-ridged golden fruit, rounded lobes, recessed valleys and a stalk.
  vs=[];fs=[];rows=18;segments=60
  for j in range(rows+1):
   v=pi*j/rows
   for i in range(segments):
    a=2*pi*i/segments;r=(.16+.10*(.5+.5*cos(5*a))**2)*sin(v)**.70
    vs.append((r*cos(a),r*.70*sin(a),1.04+.30*cos(v)))
  for j in range(rows):
   for i in range(segments):k=j*segments+i;n=j*segments+(i+1)%segments;fs.append((k,n,n+segments,k+segments))
  g.mesh('RidgedStarfruit',vs,fs,(.90,.55,.035,1),core)
  branch('FruitStalk',[(0,0,1.31),(.025,.02,1.42),(.065,.04,1.44)],.024,core,(.24,.31,.045,1),False)
 elif kind=='blossom':
  # Warm thin veins run into each dimensional petal.
  for j in range(9+t):
   a=j*2*pi/(9+t);g.tube('PetalVein',curve([(.08*cos(a),.08*sin(a),1.015),(.20*cos(a),.20*sin(a),1.05),(.30*cos(a),.30*sin(a),1.0)],4),.0035,(.53,.27,.025,1),turret,5)
 elif kind=='book':
  pages=next((o for o in turret.children if o.name=='Pages'),turret)
  for side in [-1,1]:
   for row in range(6):
    for word in range(3):
     x=side*(.06+word*.065);y=-.13+row*.048;g.tube('InkScript',[(x,y,.088+t*.009),(x+side*.012,y+.005,.094+t*.009),(x+side*.03,y,.097+t*.009)],.0025,(.18,.08,.025,1),pages,4)
 elif kind=='thunder':
  clouds=[o for o in list(turret.children) if o.type=='EMPTY' and o.name=='Core']
  if clouds:
   core=clouds[0];objects=[o for o in core.children if o.type=='MESH']
   if objects:
    cloud=fuse('ContinuousStormCloud',objects,core,(.36,.44,.48,1),.02)
    for v in cloud.data.vertices:
     p=v.co;p+=v.normal*(.009*sin(p.x*34+p.z*29)+.005*sin(p.y*51))
