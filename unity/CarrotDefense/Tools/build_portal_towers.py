"""Additive Portal expansion: 50 authored botanical/mechanical tower meshes.

Coordinates are metres, Z up and -Y forward. Every tier changes geometry.
Shared helpers only; this script never runs the original tower builder.
"""
import sys, os, math, random, json
from pathlib import Path
from math import sin, cos, pi, sqrt
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
import build_carrot_models as g
import sculpt_carrot_details as d
import bpy

KINDS=['bamboo','chili','lotus','magnet','orchid','mushroom','cactus','clockflower','dragonfruit','moonflower']
GREEN=(.065,.23,.026,1);LIGHTGREEN=(.30,.48,.06,1);COPPER=(.50,.19,.055,1);BRONZE=(.43,.27,.08,1);SILVER=(.40,.47,.53,1)
RED=(.58,.018,.006,1);PINK=(.62,.035,.15,1);PURPLE=(.26,.018,.42,1);BLUE=(.02,.23,.66,1);CYAN=(.035,.48,.56,1)
WHITE=(.88,.87,.70,1);DARK=(.018,.022,.028,1);GOLD=(.71,.42,.095,1);YELLOW=(1,.36,.02,1)

def pipe(name,pts,r,col,parent,material='Organic',sides=10):
 p=d.curve(pts,5)
 rr=[r*(1-.18*i/max(1,len(p)-1)) for i in range(len(p))] if isinstance(r,(int,float)) else r
 return g.tube(name,p,rr,col,parent,sides,material)

def petal(name,start,end,width,col,parent,cup=.1,twist=0,material='Petal',veins=True):
 """Closed, five-column lamina with rolled edges and a raised branching midrib."""
 a=Vector(start);b=Vector(end);axis=b-a;side=axis.cross(Vector((0,0,1)))
 if side.length<.001:side=Vector((1,0,0))
 side.normalize();vs=[];N=13;M=5
 for layer in [0,1]:
  for j in range(N):
   t=j/(N-1);mid=a+axis*t+Vector((sin(t*pi)*twist,0,cup*sin(pi*t)))
   w=width*sin(pi*t)**.65
   for i in range(M):
    u=(i/(M-1)-.5)*2
    vs.append(tuple(mid+side*w*u+Vector((0,0,.035*(1-u*u)*sin(pi*t)+.028*u*u*sin(t*pi*1.6)-layer*.012))))
 fs=[];offset=N*M
 for j in range(N-1):
  for i in range(M-1):
   k=j*M+i;fs.extend([(k,k+1,k+M+1,k+M),(k+offset+M,k+offset+M+1,k+offset+1,k+offset)])
  for i in [0,M-1]:k=j*M+i;fs.append((k,k+M,k+M+offset,k+offset))
 ob=g.mesh(name,vs,fs,col,parent,material)
 # Colour follows the leaf surface instead of applying a flat painted disk.
 attr=ob.data.color_attributes['Color']
 for p in ob.data.polygons:
  for li in p.loop_indices:
   vi=ob.data.loops[li].vertex_index%offset;t=(vi//M)/(N-1);edge=abs((vi%M)/(M-1)-.5)*2
   gain=.73+.25*t+.10*(1-edge)
   attr.data[li].color=tuple(min(1,c*gain) for c in col[:3])+(1,)
 if veins:
  vein=tuple(min(1,c*1.25+.018) for c in col[:3])+(1,)
  path=[tuple(a+axis*t+Vector((sin(t*pi)*twist,0,cup*sin(pi*t)+.038*sin(pi*t)))) for t in [0,.2,.4,.6,.8,.97]]
  g.tube(name+'Midrib',d.curve(path,2),.005,vein,parent,5,material)
  for t in [.25,.43,.61]:
   mid=a+axis*t+Vector((sin(t*pi)*twist,0,cup*sin(pi*t)+.025))
   for s in [-1,1]:
    end=a+axis*(t+.14)+side*s*width*sin(pi*(t+.14))**.65*.86+Vector((sin((t+.14)*pi)*twist,0,cup*sin(pi*(t+.14))+.018))
    g.tube(name+'Vein',d.curve([tuple(mid),tuple((mid+end)*.5+Vector((0,0,.008))),tuple(end)],2),.0028,vein,parent,4,material)
 return ob

def bulb(name,center,radii,col,parent,material='Organic',lobes=0,segments=32,rings=20):
 vs=[];fs=[]
 for j in range(rings+1):
  v=pi*j/rings
  for i in range(segments):
   a=2*pi*i/segments;f=1+.09*cos(a*lobes)*sin(v) if lobes else 1
   f*=1+.018*sin(a*7+v*9)
   vs.append((center[0]+radii[0]*sin(v)*cos(a)*f,center[1]+radii[1]*sin(v)*sin(a)*f,center[2]+radii[2]*cos(v)))
 for j in range(rings):
  for i in range(segments):k=j*segments+i;n=j*segments+(i+1)%segments;fs.append((k,n,n+segments,k+segments))
 return g.mesh(name,vs,fs,col,parent,material)

def gear(name,center,radius,parent,teeth=12,col=BRONZE,depth=.04):
 # Closed tooth profile, modelled in the front XZ plane.
 vs=[];N=teeth*4
 for y in [-depth/2,depth/2]:
  for i in range(N):
   a=2*pi*i/N;r=radius*(1 if i%4 in [1,2] else .83)
   vs.append((center[0]+r*cos(a),center[1]+y,center[2]+r*sin(a)))
 fs=[tuple(range(N-1,-1,-1)),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 ob=g.mesh(name,vs,fs,col,parent,'Metal',False)
 # Circular rim and boss leave gears physically legible even at a distance.
 for r in [radius*.68,radius*.25]:
  o=g.ring('GearRim',r,0,GOLD,parent,.009,32);o.rotation_euler.x=pi/2;o.location=center
 return ob

def collar(parent,z,r,material='Metal',col=GOLD):
 g.ring('BindingRim',r,z,col,parent,.019,32,material=material)
 for j in range(8):
  a=2*pi*j/8;g.ellipsoid('Rivet',(r*cos(a),r*sin(a),z),(.012,.012,.011),SILVER,parent,8,5,'Metal')

def foundation(root,t,kind):
 # Uneven stone/root foundation, not the identical pedestal used by every family.
 soil=(.095,.055,.018,1)
 if kind in ['lotus','moonflower']:
  g.lathe('CarvedBasin',[(.34,0),(.39,.05),(.42,.12),(.39,.16),(.31,.13),(.29,.075)],(.18,.25,.25,1),root,segments=40,material='Stone',lobes=7)
  g.lathe('WaterSurface',[(.30,.085),(.30,.089)],(.015,.21,.24,1),root,segments=40,material='Glow')
 else:
  g.lathe('EarthBed',[(.31,0),(.38,.035),(.40,.085),(.36,.12)],soil,root,segments=32,lobes=7)
  n=7 if kind in ['chili','dragonfruit'] else 5
  for j in range(n):
   a=j*2*pi/n+.2;d.roughstone('FoundationStone',(.32*cos(a),.30*sin(a),.07),(.11,.09,.075),root,(.14,.17,.13,1))
 for j in range(4+t//2):
  a=j*2.399;d.branch('Root',[(.07*cos(a),.07*sin(a),.28),(.19*cos(a+.2),.19*sin(a+.2),.14),(.38*cos(a),.32*sin(a),.04)],.035,root,g.BARK,True)
 for j in range(3+t):
  a=j*2.399;r=.26+.025*sin(j)
  petal('BasalLeaf',(r*cos(a),r*sin(a),.12),((r+.13)*cos(a+.3),(r+.13)*sin(a+.3),.16+.03*sin(j)),.035,GREEN,root,.035,material='PortalBamboo',veins=False)
 if kind not in ['chili','dragonfruit']:
  for j in range(2):g.flower(((-1 if j else 1)*.26,-.20,.15),root,.045)

def stalk(parent,top,col=GREEN):
 pipe('LivingStem',[(0,0,.13),(-.06,.025,.36),(.04,.015,top*.75),(0,0,top)],.065,col,parent,'PortalBamboo',12)
 for s in [-1,1]:petal('StemLeaf',(s*.02,.03,.35),(s*.31,.035,.61),.10,GREEN,parent,.10,material='PortalBamboo')

def spear(parent,x,y,z,h,t):
 o=g.lathe('BambooBarrel',[(.073,0),(.083,h*.15),(.080,h*.70),(.073,h),(.056,h),(.052,h*.82)],GREEN,parent,(x,y,z),24,'PortalBamboo',lobes=7)
 for k in range(3):
  zz=z+h*(.14+k*.35);g.ring('BambooNode',.084,zz,BRONZE,parent,.012,24,(x,y))
 for j in range(7):
  a=j*2*pi/7;pipe('BambooFiber',[(x+.078*cos(a),y+.078*sin(a),z+.03),(x+.081*cos(a),y+.081*sin(a),z+h*.5),(x+.075*cos(a),y+.075*sin(a),z+h*.92)],.003,LIGHTGREEN,parent,'PortalBamboo',4)
 g.lathe('SpearCollar',[(.051,0),(.058,.035),(.043,.075)],GOLD,parent,(x,y,z+h),20,'Metal')
 # Four fluted faces and a real sharply tapered socketed point.
 vs=[(x+.068,y,z+h+.06),(x,y-.045,z+h+.06),(x-.068,y,z+h+.06),(x,y+.045,z+h+.06),(x,y,z+h+.32)]
 g.mesh('FlutedSpear',vs,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],SILVER,parent,'Metal',False)

def pepper(parent,loc,size,col=RED):
 x,y,z=loc
 path=d.curve([(x,y,z),(x-.03*size,y-.02*size,z+.24*size),(x+.045*size,y,z+.48*size),(x+.16*size,y+.02*size,z+.63*size)],5)
 radii=[.105*size*sin(pi*(i/(len(path)-1))**.75)**.65+.004 for i in range(len(path))]
 g.tube('PepperPod',path,radii,col,parent,18,'PortalPeel')
 pipe('PepperStem',[(x+.16*size,y+.02*size,z+.63*size),(x+.16*size,y,z+.72*size),(x+.10*size,y,z+.77*size)],.018*size,GREEN,parent,'PortalBamboo')

def flower_ring(parent,z,n,r,spread,col,cup=.13):
 for j in range(n):
  a=2*pi*j/n;petal('LayeredPetal',(.06*cos(a),.06*sin(a),z),(r*cos(a),r*sin(a),z+spread),.105,col,parent,cup,twist=.015*sin(a))

def tower(kind,t):
 g.clear();random.seed(1800+KINDS.index(kind)*19+t)
 root=g.empty(kind+'-'+str(t));foundation(root,t,kind)
 turret=g.empty('Turret',root);core=g.empty('Core',turret);petals=g.empty('Petals',turret);barrel=g.empty('Barrel',turret);muzzle=g.empty('Muzzle',turret,(0,-.35,.98))
 H=.95+(t-1)*.09
 if kind=='bamboo':
  # Splayed, socketed bamboo launcher with integrated veins and bearings.
  g.lathe('LauncherTurntable',[(.22,.13),(.24,.18),(.20,.24)],BRONZE,turret,segments=32,material='Metal')
  spears=g.empty('Spears',barrel)
  for j in range(1+min(t,4)):
   a=(j-(min(t,4))/2)*.23;x=.13*sin(a*2.1);y=.12*cos(a*2.1);z=.24
   parent=g.empty('LanceSocket'+str(j),spears,(x,y,z));parent.rotation_euler=(.32+.12*(j%2),.18*(j-min(t,4)/2),0)
   spear(parent,0,0,0,.52+.06*t-.08*(j%2),t)
  for s in [-1,1]:gear('LancerBearing',(s*.23,-.06,.40),.12,turret,10)
  for j in range(3+t):
   a=j*2.399;petal('BambooLeaf',(.13*cos(a),.09,.43),(.37*cos(a),.1+.25*sin(a),.72+.12*sin(j)),.042,GREEN,petals,.06,material='PortalBamboo')
  if t>=3:
   for s in [-1,1]:pipe('FeedRail',[(s*.23,.13,.22),(s*.28,.16,.52),(s*.24,.13,.82)],.028,BRONZE,turret,'Metal')
  if t==5:
   for j in range(3):spear(spears,(j-1)*.15,.25,.26,.75+(j%2)*.14,t)
   gear('LaunchDrive',(0,-.24,.33),.19,core,16)
 elif kind=='chili':
  # Hollow furnace, slotted grille, riveted bands, crooked fruit feed pods.
  g.lathe('Furnace',[(.20,.15),(.27,.30),(.23,.66),(.18,H),(.13,H),(.15,.70),(.17,.30)],(.065,.052,.045,1),turret,segments=40,material='Metal',lobes=8)
  g.lathe('FireWell',[(.13,.68),(.14,H-.015)],YELLOW,core,segments=24,material='Glow')
  for z,r in [(.29,.26),(.66,.23),(H-.04,.18)]:collar(turret,z,r,col=COPPER)
  for j in range(9):
   a=j*2*pi/9;pipe('FurnaceVent',[(.243*cos(a),.243*sin(a),.33),(.238*cos(a),.238*sin(a),.44),(.222*cos(a),.222*sin(a),.55)],.013,YELLOW,core,'Glow',5)
  pods=g.empty('Pods',turret)
  for j in range(t+1):
   a=j*2.399;pepper(pods,(.26*cos(a),.26*sin(a),.20+.22*(j%2)),.68+.12*(j%2))
  if t>=3:
   for s in [-1,1]:pipe('ExhaustPipe',[(s*.17,.1,.55),(s*.32,.12,.65),(s*.34,.10,.91)],.045,COPPER,turret,'Metal',14)
  if t==5:
   for j in range(4):
    a=j*pi/2;petal('FlameVane',(.17*cos(a),.17*sin(a),H-.1),(.36*cos(a),.36*sin(a),H+.22),.1,YELLOW,petals,.1,material='Glow')
   gear('FurnaceGovernor',(0,-.29,.24),.14,barrel,14)
 elif kind=='lotus':
  stalk(turret,.65)
  g.lathe('SanctuaryBowl',[(.12,.29),(.22,.35),(.30,.51),(.32,.55),(.27,.54),(.19,.40)],BRONZE,turret,segments=40,material='Metal',lobes=8)
  g.lathe('BowlWater',[(.26,.52),(.26,.529)],CYAN,core,segments=40,material='Glow')
  for j in range(6+t):
   a=j*2*pi/(6+t);pipe('BowlRib',[(.12*cos(a),.12*sin(a),.3),(.25*cos(a),.25*sin(a),.45),(.31*cos(a),.31*sin(a),.55)],.011,GOLD,turret,'Metal',6)
  for layer in range(2+(t>=3)+(t==5)):
   flower_ring(petals,.62+layer*.09,6+2*layer,.32-layer*.055+.015*t,.22+.06*layer,[(.60,.05,.15,1),(.72,.24,.30,1),WHITE,(.21,.57,.62,1)][layer],.13)
  stamens=g.empty('Stamen',core)
  for j in range(13+t*2):
   a=j*2.399;r=.08*sqrt((j+1)/(13+t*2));pipe('LotusStamen',[(r*cos(a),r*sin(a),.68),(r*1.1*cos(a),r*1.1*sin(a),H-.08)],.005,GOLD,stamens,'Metal',5);g.ellipsoid('PollenTip',(r*1.1*cos(a),r*1.1*sin(a),H-.065),(.014,.014,.022),YELLOW,stamens,8,5,'Glow')
  if t>=2:
   for s in [-1,1]:petal('WaterPad',(s*.04,.02,.41),(s*.41,.02,.46),.15,GREEN,petals,.04,material='PortalBamboo')
  if t==5:
   for s in [-1,1]:
    branch=g.empty('SatelliteLotus'+str(s),petals,(s*.29,.12,.20));flower_ring(branch,.42,6,.18,.16,(.72,.25,.30,1),.08)
 elif kind=='magnet':
  stalk(turret,.50);u=barrel
  # Continuous rectangular horseshoe cross-section swept through 180 degrees.
  pts=[(-.29,0,H),(-.29,0,.77),(-.27,0,.57),(-.16,0,.45),(0,0,.43),(.16,0,.45),(.27,0,.57),(.29,0,.77),(.29,0,H)]
  pipe('ForgedHorseshoe',pts,.085,COPPER,u,'Metal',8)
  for s in [-1,1]:g.box('MagnetPole',(s*.29,-.003,H-.015),(.18,.17,.14),SILVER,u,.014,'Metal')
  clover=g.empty('Clover',core)
  for j in range(4):
   a=j*pi/2+pi/4;petal('CloverHeart',(0,-.095,.67),(.18*cos(a),-.13,.67+.18*sin(a)),.085,(.025,.31,.06,1),clover,.035,material='PortalBamboo')
  coils=g.empty('Coils',turret)
  for s in [-1,1]:
   for j in range(5+t):g.ring('CopperWinding',.095,.52+j*.031,COPPER,coils,.008,24,(s*.29,0))
  if t>=3:
   for s in [-1,1]:gear('MagnetGear',(s*.22,-.09,.27),.12,core,10)
  if t==5:
   for s in [-1,1]:
    p=g.empty('SideMagnet'+str(s),turret,(s*.36,.09,.33));p.scale=(.52,)*3;pipe('SecondaryHorseshoe',pts,.085,COPPER,p,'Metal',8)
   g.crystal('FluxHeart',(0,-.14,.63),.06,.21,CYAN,core)
 elif kind=='orchid':
  stalk(turret,.76)
  for layer in range(1+(t>=3)):
   z=.76+layer*.23
   for j in range(5):
    a=j*2*pi/5+.2*layer;end=(.34*cos(a),.17*sin(a)-.10,z+.17+.25*sin(a))
    petal('OrchidPetal',(0,0,z),end,.13 if j!=3 else .17,PURPLE,petals,.14,twist=.05*cos(a))
    # Irregular raised speckling on the broad flower panels.
    for k in range(5):
     f=.38+k*.105;p=Vector((0,0,z)).lerp(Vector(end),f)+Vector((.03*sin(k*2.4+j),-.015,.14*sin(pi*f)+.026));g.ellipsoid('OrchidSpeckle',p,(.011,.009,.006),(.045,.002,.055,1),petals,6,4)
   g.lathe('OrchidThroat',[(.07,0),(.095,.09),(.04,.15)],(.15,.008,.17,1),barrel,(0,-.06,z),24,'Petal')
   for s in [-1,1]:pipe('VenomFang',[(s*.07,-.075,z+.03),(s*.06,-.17,z),(s*.035,-.20,z+.07)],.016,WHITE,barrel,'Organic',7)
  for j in range(t):
   a=j*2.399;pipe('Tendril',[(.02,.02,.44),(.20*cos(a),.15*sin(a),.64),(.30*cos(a),.21*sin(a),.61)],.016,GREEN,turret,'PortalBamboo');g.ellipsoid('VenomDrop',(.30*cos(a),.21*sin(a),.58),(.027,.027,.044),LIGHTGREEN,core,12,8,'Glow')
  if t==5:
   flower_ring(petals,1.13,5,.32,.14,(.40,.055,.61,1),.18);g.crystal('VenomReservoir',(0,0,.24),.11,.28,PURPLE,core)
 elif kind=='mushroom':
  def cap(parent,loc,scale):
   x,y,z=loc
   pipe('MushroomStem',[(x,y,.14),(x-.04*scale,y+.02,z-.21*scale),(x,y,z)],.07*scale,(.31,.22,.19,1),parent,'PortalCap',12)
   g.lathe('VelvetCap',[(0,.16*scale),(.07*scale,.155*scale),(.14*scale,.135*scale),(.21*scale,.096*scale),(.28*scale,.043*scale),(.335*scale,-.016*scale),(.37*scale,-.070*scale),(.37*scale,-.090*scale),(.345*scale,-.108*scale),(.29*scale,-.087*scale),(.20*scale,-.050*scale),(.08*scale,-.015*scale)],BLUE,parent,(x,y,z),40,'PortalCap',lobes=9)
   for j in range(22):
    a=j*2*pi/22;pipe('RadiatingGill',[(x+.075*scale*cos(a),y+.075*scale*sin(a),z-.025*scale),(x+.20*scale*cos(a),y+.20*scale*sin(a),z-.055*scale),(x+.34*scale*cos(a),y+.34*scale*sin(a),z-.105*scale)],.0038*scale,CYAN,parent,'Glow',4)
   for j in range(13):
    a=j*2.399;r=.29*scale*sqrt((j+.5)/13);g.ellipsoid('CapPearl',(x+r*cos(a),y+r*sin(a),z+.167*scale-1.45*r*r/scale),(.015*scale,.02*scale,.009*scale),CYAN,parent,8,5,'Glow')
   for j in range(9):
    a=j*2*pi/9;pts=[]
    for k in range(7):
     rr=(.09+k*.042)*scale;aa=a+.10*sin(k*.8+j);zz=.164*scale-1.45*rr*rr/scale;pts.append((x+rr*cos(aa),y+rr*sin(aa),z+zz))
    g.tube('RaisedCapFold',pts,[.003*scale]*len(pts),(.023,.13,.33,1),parent,5,'PortalCap')
  cap(petals,(0,0,H-.10),1+.035*t)
  for j in range(t-1):a=j*2.399;cap(turret,(.24*cos(a),.22*sin(a),.40+.10*(j%2)),.40+.05*(j%2))
  for j in range(3):a=j*2*pi/3;d.branch('TwistingRoot',[(.18*cos(a),.17*sin(a),.15),(.11*cos(a+.7),.1*sin(a+.7),.44),(.08*cos(a+1.8),.08*sin(a+1.8),.76)],.03,turret,g.BARK,True)
  if t==5:
   cap(core,(0,.05,H+.27),.65);g.ring('MycelialRing',.25,H-.18,CYAN,core,.011,36,material='Glow')
 elif kind=='cactus':
  def arm(parent,path,r):
   p=d.curve(path,6);rads=[r*(.55+.45*sin(pi*i/max(1,len(p)-1))**.55) for i in range(len(p))];o=g.tube('RibbedCactus',p,rads,GREEN,parent,16,'PortalBamboo')
   # The cactus ribs and paired areoles are physical, not a painted cylinder.
   for j in range(7):
    a=j*2*pi/7;points=[(v[0]+rr*.97*cos(a),v[1]+rr*.97*sin(a),v[2]) for v,rr in zip(p,rads)];g.tube('CactusRib',points,.012,LIGHTGREEN,parent,6,'PortalBamboo')
    for k in range(2,len(p)-2,3):
     q=Vector(points[k]);end=q+Vector((cos(a)*.062,sin(a)*.062,.025));g.tube('CactusSpine',[q,end],[.008,.001],WHITE,parent,5)
   return o
  arm(turret,[(0,0,.15),(0,.025,.45),(0,0,H)],.145)
  for j in range(1+min(t,3)):
   s=-1 if j%2 else 1;z=.30+.14*(j//2);arm(petals,[(s*.04,.05,z),(s*.24,.04,z+.07),(s*.29,.02,z+.32+.04*t)],.075)
  top=g.empty('Spines',barrel);flower_ring(top,H-.02,7,.19,.15,RED,.065)
  g.lathe('CactusMuzzle',[(.095,0),(.12,.10),(.078,.11),(.073,.03)],GOLD,barrel,(0,0,H-.02),24,'Metal')
  if t>=3:collar(turret,.35,.15)
  if t==5:
   for a in [0,pi*.66,pi*1.33]:arm(petals,[(.08*cos(a),.08*sin(a),.66),(.32*cos(a),.32*sin(a),.85),(.35*cos(a),.35*sin(a),1.22)],.08)
 elif kind=='clockflower':
  stalk(turret,.74,(.13,.20,.055,1));z=.90+.045*t
  # Front-facing clock gear with separate minute/hour hands and escape wheel.
  gear('ClockFace',(0,-.04,z),.27,turret,24)
  g.ellipsoid('ClockRecess',(0,-.078,z),(.215,.023,.215),DARK,turret,32,16,'Metal')
  for radius in [.215,.177]:
   rim=g.ring('EngravedClockRim',radius,0,GOLD,turret,.009,48);rim.rotation_euler.x=pi/2;rim.location=(0,-.12,z)
  for gx,gz,gr in [(-.080,z-.048,.072),(.065,z+.043,.083),(.075,z-.106,.042)]:gear('VisibleClockMovement',(gx,-.125,gz),gr,core,12)
  for j in range(12):
   a=j*2*pi/12;pipe('HourMarker',[(.18*sin(a),-.108,z+.18*cos(a)),(.205*sin(a),-.109,z+.205*cos(a))],.007,GOLD,turret,'Metal',5)
  hands=g.empty('ClockHands',core,(0,-.18,z))
  g.tube('MinuteHand',[(0,0,-.025),(0,0,.19)],[.017,.004],GOLD,hands,6,'Metal');g.tube('HourHand',[(0,0,0),(.11,0,.045)],[.021,.008],GOLD,hands,6,'Metal')
  for j in range(10+t):
   a=j*2*pi/(10+t);petal('ClockPetal',(.17*cos(a),.01,z+.17*sin(a)),(.41*cos(a),.02,z+.41*sin(a)),.071,WHITE,petals,.07)
  for j in range(t):
   x=(j%2*2-1)*(.10+.025*(j//2));zz=.32+.14*(j//2);gear('EscapementGear',(x,-.14,zz),.09+(.025 if j%2 else 0),core,12)
  pend=g.empty('Pendulum',barrel,(0,-.09,.48));pipe('PendulumShaft',[(0,0,0),(0,0,-.24)],.012,BRONZE,pend,'Metal');g.ellipsoid('PendulumBob',(0,0,-.24),(.075,.02,.075),GOLD,pend,16,8,'Metal')
  if t==5:
   for s in [-1,1]:gear('GrandEscapement',(s*.30,.08,.47),.14,core,14);pipe('ClockBrace',[(s*.28,.05,.19),(s*.34,.09,.57),(s*.26,.10,.81)],.025,BRONZE,turret,'Metal')
 elif kind=='dragonfruit':
  for s in [-1,1]:d.roughstone('CrackedCradle',(s*.20,0,.28),(.14,.18,.21),turret,(.15,.12,.10,1))
  # Lobed peel carries overlapping swept scales and an open glowing launch throat.
  z=.72+.035*t;bulb('DragonfruitPeel',(0,0,z),(.24+.015*t,.23,.34+.025*t),PINK,turret,'PortalPeel',7)
  for row in range(4):
   for j in range(7):
    a=2*pi*(j+.45*(row%2))/7;r=(.20+.015*t)*sin(pi*(row+1)/6);zz=z-.23+row*.14
    petal('FruitScale',(r*cos(a),r*sin(a),zz),((r+.075)*cos(a+.10),(r+.075)*sin(a+.10),zz+.18),.055,GREEN,petals,.035,material='PortalBamboo',veins=False)
  # Opening on the front has a recessed ember heart and six armoured lip segments.
  g.ellipsoid('EmberThroat',(0,-.227,z+.10),(.12,.025,.12),YELLOW,core,24,14,'Glow')
  for j in range(7):
   a=j*2*pi/7;petal('ThroatScale',(.12*cos(a),-.244,z+.10+.12*sin(a)),(.16*cos(a),-.27,z+.10+.16*sin(a)),.035,RED,barrel,.025,material='PortalPeel',veins=False)
  for j in range(t-1):
   a=j*2.399;small=g.empty('FruitPod'+str(j),turret,(.26*cos(a),.25*sin(a),.25));bulb('YoungDragonfruit',(0,0,.13),(.07,.065,.11),PINK,small,'PortalPeel',5)
  if t==5:
   orbit=g.empty('Orbits',turret)
   for j in range(3):
    a=j*2*pi/3;bulb('OrbitFruit',(.36*cos(a),.36*sin(a),1.11),(.07,.065,.095),PINK,orbit,'PortalPeel',5);g.crystal('OrbitCore',(.36*cos(a),.36*sin(a),1.17),.03,.13,YELLOW,orbit)
 elif kind=='moonflower':
  stalk(turret,.73);z=.87+.045*t
  for j in range(5+t):
   a=j*2*pi/(5+t);petal('LunarPetal',(.04*cos(a),0,z+.04*sin(a)),(.39*cos(a),.07,z+.39*sin(a)),.10,(.32,.45,.74,1),petals,.17,twist=.07*sin(a))
  # A crescent is a closed extruded swept blade, not an overlaid full sphere.
  path=[]
  for i in range(31):a=pi*.28+i/30*pi*1.44;path.append((.17*cos(a)+.03,-.13,z+.21*sin(a)))
  g.tube('SilverCrescent',path,[.006+.035*sin(pi*i/30)**.75 for i in range(31)],SILVER,core,10,'Metal')
  for j in range(t+1):
   a=j*2.399;g.crystal('LunarCrystal',(.22*cos(a),-.04+.10*sin(a),.52+.13*(j%3)),.037,.14,BLUE,turret)
  if t>=3:
   ring=g.empty('Ring01',turret,(0,0,z));o=g.ring('LunarOrbit',.26,0,SILVER,ring,.008,48);o.rotation_euler.x=pi/2
  if t==5:
   for s in [-1,1]:petal('EclipseWing',(s*.10,.02,.55),(s*.47,.10,1.31),.12,(.45,.55,.78,1),petals,.15,twist=s*.06)
   g.ellipsoid('DarkMoon',(0,-.075,z),(.10,.045,.10),(.006,.013,.035,1),core,24,16,'Metal')
 # Tier-five coronation is family-specific, with small sigils as secondary detail.
 if t==5:
  for j in range(5):
   a=j*2*pi/5;g.crystal('SuperRune',(.28*cos(a),.28*sin(a),.12),.02,.08,(.35,.60,.78,1),root,4)
 # Fine variations in the actual vertex palette complement normal/roughness
 # maps; broad polished pieces no longer have a perfectly uniform alloy colour.
 for ob in bpy.context.scene.objects:
  if ob.type!='MESH' or not ob.data.materials or ob.data.materials[0].name!='Metal':continue
  attr=ob.data.color_attributes.get('Color')
  if not attr:continue
  for poly in ob.data.polygons:
   for li in poly.loop_indices:
    co=ob.data.vertices[ob.data.loops[li].vertex_index].co
    gain=.82+.18*(.5+.5*sin(co.x*37+co.y*23)*sin(co.z*29-co.y*11))
    color=attr.data[li].color;attr.data[li].color=(color[0]*gain,color[1]*gain,color[2]*gain,color[3])
 # Socket/plant authoring groups do not animate independently at runtime.
 # Bake those transforms and merge by material under the actual motion pivots.
 motion={'Turret','Core','Barrel','Petals','Muzzle','Ring01','Ring02','Spears','Pods','Stamen','Coils','Cap','Spines','ClockHands','Orbits','Pendulum','Clover'}
 bpy.context.view_layer.update()
 for ob in list(bpy.context.scene.objects):
  if ob.type!='MESH':continue
  parent=ob.parent
  while parent and parent!=root and parent.name not in motion:parent=parent.parent
  parent=parent or root
  if ob.parent!=parent:
   matrix=ob.matrix_world.copy();ob.parent=parent;ob.matrix_world=matrix
 for ob in list(bpy.context.scene.objects):
  if ob.type=='EMPTY'and ob!=root and ob.name not in motion and not ob.children:bpy.data.objects.remove(ob,do_unlink=True)
 g.export(root,kind+'-'+str(t),False)

if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 selected=args[0].split(',') if args and args[0]!='all' else KINDS
 tiers=[int(x) for x in args[1].split(',')] if len(args)>1 else list(range(1,6))
 for k in selected:
  if k not in KINDS:raise ValueError(k)
  for t in tiers:tower(k,t)
 output=g.ROOT/'Tools/portal-tower-manifest.json'
 old=json.loads(output.read_text()) if output.exists() else []
 entries={item['name']:item for item in old}
 for item in g.manifest:entries[item['name']]=item
 output.write_text(json.dumps(list(entries.values()),indent=2)+'\n')
