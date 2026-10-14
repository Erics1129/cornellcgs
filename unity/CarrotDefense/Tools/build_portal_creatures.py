"""Original Portal creatures: distinct authored bodies plus compact native rigs.

No new downloaded character meshes are used. Detail is actual mesh geometry.
The 27 creatures have original Idle/Walk/Attack/Hit/Death actions; the Portal
is a procedural multi-part aperture with named rings and talons.
"""
import bpy, sys, os, math, json, random
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi,sqrt
sys.path.insert(0,os.path.dirname(__file__))
import build_carrot_models as g
import sculpt_carrot_details as d
from build_portal_towers import petal,bulb,pipe,gear,GREEN,LIGHTGREEN,COPPER,BRONZE,SILVER,RED,PINK,PURPLE,BLUE,CYAN,WHITE,DARK,GOLD,YELLOW

REGULAR=['mite','beetle','slug','wisp','bat','scarab','firefly','sporeling','tinyZombie','riftling','shardling','mimic']
MINIS=['warDrummer','frostHerald','witherPriest','stormWarden','graveCaller','mirrorKnight','riftStalker','mossGolem','emberBoar','venomQueen','ironSnail','lanternLeech','chronoMoth','thornBeast','portalSentinel']
BONE=(.56,.48,.30,1);SKIN=(.095,.22,.12,1);IRON=(.10,.14,.16,1);TEAL=(.018,.16,.17,1)
parts={};joints={}

def part(name,root,pivot=(0,0,0),parent='Body'):
 p=g.empty(name,root);parts[name]=p;joints[name]=(pivot,parent);return p

def eyes(parent,loc,size=.065,glow=YELLOW,separation=.12):
 x,y,z=loc
 for s in [-1,1]:
  d.eyelid(parent,x+s*separation,y,z,size,TEAL,glow)
  g.ellipsoid('EyeSlit',(x+s*separation,y-.052,z),(size*.15,.012,size*.43),DARK,parent,10,6)

def jaw(parent,loc,width=.15,tusks=False):
 x,y,z=loc;g.ellipsoid('RecessedMaw',(x,y,z),(width,.035,width*.40),DARK,parent,20,10)
 for j in range(5):
  xx=x+(j-2)*width*.31;zz=z+width*.26
  g.tube('IrregularTooth',[(xx,y-.025,zz),(xx+.005,y-.030,zz-.050-(j%2)*.018)],[.013,.002],BONE,parent,6)
 if tusks:
  for s in [-1,1]:
   path=d.curve([(x+s*width,y,z-.025),(x+s*width*1.3,y-.10,z+.012),(x+s*width*1.25,y-.16,z+.12)],6)
   g.tube('CurvedTusk',path,[.025*(1-i/(len(path)-.2))+.002 for i in range(len(path))],BONE,parent,10)

def leg(root,index,start,knee,end,col=TEAL,r=.045,claw=True):
 p=part('Leg'+str(index),root,start)
 path=d.curve([start,knee,end],5);rad=[r*(1-.67*i/(len(path)-1)) for i in range(len(path))]
 g.tube('JointedLeg',path,rad,col,p,10,'PortalChitin')
 bulb('LegJoint',knee,(r*1.25,r*1.15,r*1.1),col,p,'PortalChitin',0,14,9)
 if claw:
  q=Vector(end);g.tube('FootClaw',[q,q+Vector((0,-.07,-.015))],[r*.48,.001],DARK,p,6)
 return p

def insect_legs(root,count=6,height=.27,width=.17,length=.28,col=TEAL,r=.033):
 for j in range(count//2):
  y=-length/2+j*length/max(1,count//2-1)
  for s in [-1,1]:leg(root,j*2+(s>0),(s*width*.65,y,height),(s*width*1.65,y+.03,height*.60),(s*width*2,y-.055,.04),col,r)

def horns(parent,loc,width=.21,height=.25,col=BONE,branches=False):
 x,y,z=loc
 for s in [-1,1]:
  path=d.curve([(x+s*width*.5,y,z),(x+s*width,y+.04,z+height*.55),(x+s*width*.85,y-.025,z+height)],6)
  g.tube('SweptHorn',path,[width*.20*(1-i/(len(path)-.5))+.002 for i in range(len(path))],col,parent,10)
  if branches:
   pipe('HornBranch',[(x+s*width*.85,y,z+height*.40),(x+s*width*1.5,y,z+height*.63),(x+s*width*1.6,y,z+height*.86)],.02,col,parent)

def shell(parent,loc,radii,col,plates=6):
 # A curved body carapace with lapped plate boundaries, pores and inset seams.
 ob=bulb('OrganicCarapace',loc,radii,col,parent,'PortalChitin',5,28,18)
 x,y,z=loc
 for j in range(plates):
  f=(j+.5)/plates;yy=y-radii[1]*.83+f*radii[1]*1.66;rr=sqrt(max(.01,1-((yy-y)/radii[1])**2))
  pts=[]
  for k in range(15):a=pi*k/14;pts.append((x+radii[0]*rr*cos(a),yy-.015,z+radii[2]*rr*sin(a)))
  g.tube('CarapaceSeam',pts,.007,tuple(c*.32 for c in col[:3])+(1,),parent,5,'PortalChitin')
 for j in range(10):
  a=j*2.399;f=.30+.28*sin(j*.9);px=x+radii[0]*.7*cos(a);py=y+radii[1]*.65*sin(a);pz=z+radii[2]*sqrt(max(.05,1-((px-x)/radii[0])**2-((py-y)/radii[1])**2))
  g.ellipsoid('ShellPore',(px,py,pz),(.009,.009,.006),tuple(c*.48 for c in col[:3])+(1,),parent,6,4,'PortalChitin')
 return ob

def antenna(parent,start,side,length=.25,glow=YELLOW):
 x,y,z=start;path=d.curve([(x,y,z),(x+side*.06,y-.04,z+length*.66),(x+side*.09,y-.10,z+length)],5)
 g.tube('Antenna',path,[.013*(1-i/(len(path)+1))+.002 for i in range(len(path))],TEAL,parent,8,'PortalChitin')
 g.ellipsoid('AntennaLens',path[-1],(.028,.022,.027),glow,parent,12,8,'Glow')

def wing(root,name,hinge,span,height,col,pattern=False,bat=False):
 p=part(name,root,hinge);s=-1 if 'L' in name else 1;x,y,z=hinge
 # A real closed scalloped membrane, spars integrated rather than detached shards.
 edge=[(x,y,z),(x+s*span*.38,y-.18,z+height*.70),(x+s*span*.88,y-.10,z+height),(x+s*span,y+.05,z+height*.45),(x+s*span*.70,y+.16,z+height*.20),(x+s*span*.72,y+.32,z-height*.15),(x+s*span*.42,y+.24,z-height*.24),(x+s*span*.20,y+.17,z-height*.06)]
 center=Vector((x+s*span*.40,y+.055,z+height*.25));vs=[tuple(center)]+edge+[(a,b+.009,c)for a,b,c in [tuple(center)]+edge];N=len(edge)+1;fs=[]
 for i in range(1,N):j=i+1 if i+1<N else 1;fs.extend([(0,i,j),(N,N+j,N+i),(i,N+i,N+j,j)])
 g.mesh('ScallopedWing',vs,fs,col,p,'Petal',True)
 for j in [1,2,3,5,7]:pipe('WingSpar',[hinge,tuple(center),edge[j]],.008,TEAL if bat else GOLD,p,'PortalChitin' if bat else 'Metal',6)
 for j in range(len(edge)):pipe('WingEdge',[edge[j],edge[(j+1)%len(edge)]],.004,TEAL,p,'PortalChitin',5)
 if pattern:
  point=Vector(hinge)+Vector((s*span*.62,.085,height*.32))
  g.ellipsoid('WingEyespot',point,(span*.17,.014,height*.20),DARK,p,20,12)
  g.ellipsoid('WingIris',point+Vector((0,-.018,0)),(span*.10,.010,height*.14),YELLOW,p,20,12,'Glow')
  for j in range(8):
   a=j*2*pi/8;g.ellipsoid('WingPearl',point+Vector((span*.22*cos(a),-.006,height*.24*sin(a))),(.010,.008,.014),GOLD,p,6,4,'Metal')
 return p

def humanoid(root,col=SKIN,robe=False):
 body=parts['Body'];head=part('Head',root,(0,-.015,1.06))
 if robe:
  # Swept, uneven open-ended robe panels and a narrower hunched shoulder line.
  g.lathe('RaggedRobe',[(.31,.12),(.27,.30),(.17,.72),(.24,.90),(.13,1.02)],col,body,segments=32,material='PortalCap',lobes=9)
  for j in range(9):
   a=j*2*pi/9;pipe('RobeFold',[(.13*cos(a),.13*sin(a),.96),(.15*cos(a),.15*sin(a),.60),(.29*cos(a),.29*sin(a),.14)],.012,tuple(c*.62 for c in col[:3])+(1,),body,'PortalCap',5)
 else:
  shell(body,(0,.035,.75),(.25,.18,.32),col,4)
  for j,s in enumerate([-1,1]):
   p=leg(root,j,(s*.13,.02,.52),(s*.18,-.015,.28),(s*.19,-.10,.07),col,.083)
   bulb('HeavyFoot',(s*.19,-.11,.055),(.09,.15,.055),DARK,p,'PortalChitin',0,16,10)
 for j,s in enumerate([-1,1]):
  arm=part('Arm'+('L'if s<0 else'R'),root,(s*.22,0,.94))
  pipe('TaperedArm',[(s*.20,0,.94),(s*.34,-.02,.80),(s*.37,-.10,.58)],.068,col,arm,'PortalChitin',12)
  for k in range(3):pipe('Finger',[(s*.37+(k-1)*.025,-.10,.61),(s*.37+(k-1)*.037,-.16,.51)],.012,col,arm,'PortalChitin',6)
 bulb('SculptedHead',(0,-.035,1.08),(.16,.14,.20),col,head,'PortalChitin',3,24,16)
 eyes(head,(0,-.176,1.10),.047,YELLOW,.069);jaw(head,(0,-.176,1.0),.085)
 return body,head

def cap(parent,center,r,col):
 x,y,z=center
 g.lathe('SculptedMushroomCap',[(.03,.10),(.45*r,.085),(r*.80,.03),(r,-.07),(r*.98,-.092),(r*.28,-.015)],col,parent,center,36,'PortalCap',lobes=7)
 for j in range(20):
  a=j*2*pi/20;pipe('CapGill',[(x+.06*cos(a),y+.06*sin(a),z-.015),(x+r*.65*cos(a),y+r*.65*sin(a),z-.04),(x+r*.95*cos(a),y+r*.95*sin(a),z-.088)],.003,CYAN,parent,'Glow',4)
 for j in range(11):a=j*2.399;rr=r*.8*sqrt((j+.5)/11);g.ellipsoid('VelvetSpot',(x+rr*cos(a),y+rr*sin(a),z+.075-.14*rr),(.027,.019,.011),WHITE,parent,8,5)

def create(kind):
 global parts,joints
 g.clear();parts={};joints={}
 for a in list(bpy.data.actions):bpy.data.actions.remove(a)
 root=g.empty(kind);body=part('Body',root,(0,0,.40),'Root');flying=False
 random.seed(782+REGULAR.index(kind) if kind in REGULAR else 940+MINIS.index(kind))
 if kind in MINIS:
  import sculpt_portal_minibosses as refined
  if refined.build(sys.modules[__name__],kind,root):return
 if kind in ['mite','beetle','scarab','firefly']:
  cols={'mite':(.36,.045,.025,1),'beetle':(.12,.21,.036,1),'scarab':(.015,.27,.24,1),'firefly':(.16,.19,.02,1)};col=cols[kind]
  insect_legs(root,6,.28,.13,.24,col,.025)
  shell(body,(0,.075,.33),(.19,.26,.16),col,5)
  head=part('Head',root,(0,-.21,.34));bulb('InsectHead',(0,-.21,.33),(.13,.105,.10),col,head,'PortalChitin',3,20,12);eyes(head,(0,-.31,.35),.035,YELLOW,.064)
  for s in [-1,1]:
   pipe('Mandible',[(s*.07,-.29,.29),(s*.105,-.35,.28),(s*.045,-.39,.29)],.019,BONE,head,'Organic',7)
   antenna(head,(s*.07,-.22,.40),s,.13)
  if kind=='beetle':horns(head,(0,-.22,.40),.12,.25,DARK)
  if kind=='scarab':
   for j in range(5):petal('ScarabFiligree',(0,.03,.49),((j-2)*.075,.18,.45),.03,GOLD,body,.045,material='Metal',veins=False)
   g.crystal('ScarabGem',(0,-.01,.44),.055,.10,CYAN,body)
  if kind=='firefly':
   flying=True;bulb('LivingLantern',(0,.20,.35),(.145,.14,.115),(.55,.85,.08,1),body,'Glow',5,24,14)
   wing(root,'WingL',(-.08,0,.42),.32,.20,(.21,.32,.13,1));wing(root,'WingR',(.08,0,.42),.32,.20,(.21,.32,.13,1))
 elif kind in ['slug','lanternLeech','ironSnail']:
  col=TEAL if kind!='slug' else(.11,.27,.10,1)
  path=d.curve([(0,.40,.075),(0,.20,.16),(0,0,.17),(0,-.23,.25),(0,-.30,.44 if kind!='slug' else .30)],7)
  rr=[.012+.14*sin(pi*(i/(len(path)-1))**.75)**.5 for i in range(len(path))];g.tube('ContinuousGastropod',path,rr,col,body,20,'PortalChitin')
  for j in range(13):
   y=-.27+j*.053;pipe('FootRuffle',[(-.135,y,.09),(-.17,y+.02,.075),(0,y+.025,.055),(.17,y+.02,.075),(.135,y,.09)],.012,col,body,'PortalChitin',6)
  head=part('Head',root,(0,-.27,.32));eyes(head,(0,-.37,.33),.04,YELLOW,.065)
  for s in [-1,1]:antenna(head,(s*.08,-.30,.36),s,.17,CYAN)
  if kind=='ironSnail':
   # Spiral shell follows a continuous logarithmic coil, with transverse armour straps.
   pts=[];rads=[]
   for i in range(95):
    f=i/94;a=f*pi*4.7;r=.34*(1-f)+.023;pts.append((r*cos(a),.055,.43+r*sin(a)));rads.append(.065-.030*f)
   g.tube('IronSpiral',pts,rads,(.18,.22,.23,1),body,12,'Metal')
   for j in range(10):a=j*pi*.35;r=.30-j*.022;g.ellipsoid('ShellRivet',(r*cos(a),-.015,.43+r*sin(a)),(.017,.014,.017),COPPER,body,8,5,'Metal')
   g.ring('ShellAperture',.17,0,BRONZE,body,.022,36).rotation_euler.x=pi/2
  elif kind=='lanternLeech':
   bulb('LeechMantle',(0,-.17,.55),(.19,.14,.34),TEAL,body,'PortalChitin',7)
   d.lantern(body,(0,-.25,.40),1.6);jaw(head,(0,-.38,.46),.13,True)
   for j in range(5):a=j*2*pi/5;pipe('LeechTendril',[(.11*cos(a),-.15,.52),(.27*cos(a),-.18+.16*sin(a),.66),(.25*cos(a),-.20+.22*sin(a),.37)],.018,TEAL,body,'PortalChitin')
 elif kind in ['wisp','riftling','shardling']:
  if kind=='wisp':
   flying=True;bulb('SpiritMantle',(0,0,.43),(.13,.10,.23),(.12,.44,.37,1),body,'Glow',5)
   for j in range(5):
    a=j*2*pi/5;petal('TrailingSpirit',(.11*cos(a),.07*sin(a),.37),(.13*cos(a+.9),.12*sin(a+.9),.05),.04,(.015,.22,.19,1),body,.015,material='PortalCap',veins=False)
   eyes(body,(0,-.105,.49),.028,WHITE,.045)
  else:
   insect_legs(root,4,.26,.13,.20,IRON,.037)
   shell(body,(0,.035,.31),(.18,.22,.16),(.06,.035,.12,1) if kind=='riftling' else IRON,4)
   for j in range(6):a=j*2.399;g.crystal('RiftShard',(.12*cos(a),.13*sin(a),.36),.05,.14+.05*(j%2),PURPLE if kind=='riftling' else CYAN,body)
   eyes(body,(0,-.18,.34),.035,PURPLE if kind=='riftling'else CYAN,.075)
   if kind=='riftling':horns(body,(0,-.04,.43),.19,.20,DARK);jaw(body,(0,-.21,.26),.10,True)
 elif kind in ['bat','chronoMoth']:
  flying=True;scale=1 if kind=='bat' else 1.7
  shell(body,(0,0,.48),(.08*scale,.13*scale,.18*scale),PURPLE if kind=='bat'else TEAL,5)
  head=part('Head',root,(0,-.09,.61));bulb('FlightHead',(0,-.09,.60),(.095,.09,.095),TEAL,head,'PortalChitin',2)
  eyes(head,(0,-.18,.63),.032,YELLOW,.045)
  for s in [-1,1]:antenna(head,(s*.045,-.07,.66),s,.18)
  wing(root,'WingL',(-.055,0,.53),.46*scale,.34*scale,(.16,.018,.18,1)if kind=='bat'else(.09,.25,.26,1),kind=='chronoMoth',kind=='bat')
  wing(root,'WingR',(.055,0,.53),.46*scale,.34*scale,(.16,.018,.18,1)if kind=='bat'else(.09,.25,.26,1),kind=='chronoMoth',kind=='bat')
  if kind=='chronoMoth':gear('ChronoDial',(0,-.13,.39),.095,body,12);pipe('PendulumTail',[(0,.06,.35),(0,.10,.18),(0,.04,.09)],.024,GOLD,body,'Metal')
 elif kind=='sporeling':
  bulb('FungusBody',(0,0,.29),(.115,.10,.18),(.27,.20,.12,1),body,'PortalCap',5)
  for j,s in enumerate([-1,1]):leg(root,j,(s*.07,0,.20),(s*.105,-.01,.12),(s*.11,-.09,.04),(.18,.12,.08,1),.035)
  head=part('Head',root,(0,0,.40));cap(head,(0,0,.43),.23,PURPLE);eyes(head,(0,-.12,.34),.027,CYAN,.048)
  for s in [-1,1]:petal('FungusArm',(s*.08,0,.25),(s*.20,-.06,.24),.028,GREEN,body,.05,material='PortalBamboo')
 elif kind=='mimic':
  insect_legs(root,4,.18,.16,.22,(.15,.085,.025,1),.038)
  g.box('ChestBody',(0,0,.31),(.42,.32,.25),(.23,.095,.018,1),body,.025,'Bark')
  for j in range(5):pipe('PlankGroove',[((j-2)*.075,-.164,.20),((j-2)*.075,-.164,.40)],.003,DARK,body,'Organic',4)
  lid=part('Jaw',root,(0,.13,.44));g.lathe('ChestLid',[(.18,0),(.19,.08),(.13,.15),(0,.18)],(.24,.11,.03,1),lid,(0,0,.43),24,'Bark')
  for s in [-1,1]:g.box('IronStrap',(s*.15,-.169,.30),(.038,.025,.28),IRON,body,.009,'Metal')
  eyes(lid,(0,-.17,.49),.030,YELLOW,.09)
  for j in range(7):g.tube('ChestFang',[((j-3)*.045,-.172,.435),((j-3)*.045,-.184,.38)],[.012,.001],BONE,lid,6)
 elif kind in ['tinyZombie','warDrummer','frostHerald','witherPriest','mirrorKnight']:
  robes=kind in ['frostHerald','witherPriest'];col={'tinyZombie':(.10,.22,.09,1),'warDrummer':(.18,.24,.08,1),'frostHerald':(.085,.16,.24,1),'witherPriest':(.18,.085,.16,1),'mirrorKnight':(.14,.19,.22,1)}[kind]
  body,head=humanoid(root,col,robes)
  if kind=='tinyZombie':
   for j in range(4):g.box('BurlapPatch',((j%2*2-1)*.11,-.16,.60+.10*(j//2)),(.12,.02,.15),(.24,.18,.10,1),body,.006,'Bark')
   pipe('Stitch',[(0,-.19,.99),(0,-.19,1.18)],.005,BONE,head,'Organic',5)
  elif kind=='warDrummer':
   horns(head,(0,0,1.21),.26,.24,BONE);drum=part('Drum',root,(0,-.32,.62));g.lathe('DrumBarrel',[(.21,0),(.23,.08),(.22,.28),(.20,.30)],(.22,.075,.024,1),drum,(0,-.32,.47),32,'Bark',lobes=10)
   g.lathe('DrumSkin',[(.198,.30),(.198,.305)],(.60,.43,.20,1),drum,(0,-.32,.47),32,'PortalCap')
   for j in range(10):a=j*2*pi/10;pipe('DrumLacing',[(.22*cos(a),-.32+.22*sin(a),.49),(.23*cos(a+.2),-.32+.23*sin(a+.2),.64),(.21*cos(a),-.32+.21*sin(a),.76)],.007,BONE,drum)
   for s,label in [(-1,'ArmL'),(1,'ArmR')]:pipe('DrumMallet',[(s*.36,-.10,.65),(s*.20,-.35,.87)],.015,g.BARK,parts[label],'Bark');bulb('MalletHead',(s*.20,-.35,.87),(.038,.038,.04),BONE,parts[label])
  elif kind=='frostHerald':
   for j in range(7):a=j*2*pi/7;g.crystal('FrostCrown',(.14*cos(a),.03+.13*sin(a),1.20),.045,.20+.10*(j%2),CYAN,head)
   for s in [-1,1]:petal('FrozenMantle',(s*.06,.06,.92),(s*.38,.06,.55),.12,(.19,.39,.48,1),body,.06,material='PortalCap')
   staff=parts['ArmR'];pipe('IceStaff',[(.40,-.09,.12),(.40,-.09,.85),(.43,-.09,1.32)],.028,SILVER,staff,'Metal');g.crystal('StaffCrystal',(.43,-.09,1.30),.08,.30,CYAN,staff)
  elif kind=='witherPriest':
   cap(head,(0,.02,1.25),.27,(.19,.025,.12,1));horns(head,(0,.03,1.30),.24,.35,g.BARK,True)
   for j in range(5):a=j*2.399;petal('TornRobeLeaf',(.16*cos(a),.13*sin(a),.70),(.28*cos(a),.23*sin(a),.20),.07,(.09,.11,.025,1),body,.04,material='PortalBamboo')
   staff=parts['ArmR'];d.branch('WitherStaff',[(.42,-.08,.1),(.43,-.07,.68),(.44,-.04,1.22),(.35,-.04,1.43)],.03,staff,g.BARK,True);d.lantern(staff,(.35,-.04,1.22),.6)
  else:
   for s in [-1,1]:
    g.mesh('AngularPauldron',[(s*.18,-.12,.99),(s*.43,-.06,.98),(s*.38,.16,.99),(s*.20,.12,1.07),(s*.32,-.02,1.18)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],SILVER,body,'Metal',False)
   g.mesh('MirrorVisor',[(-.15,-.18,1.23),(.15,-.18,1.23),(.11,-.22,1.03),(0,-.27,.97),(-.11,-.22,1.03)],[(0,1,2,3,4)],(.34,.48,.55,1),head,'Metal',False)
   p=parts['ArmL'];g.mesh('KiteShield',[(-.53,-.18,.88),(-.25,-.18,.88),(-.23,-.24,.55),(-.39,-.29,.36),(-.55,-.24,.55),(-.39,-.32,.68)],[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5)],SILVER,p,'Metal',False)
   pipe('KnightBlade',[(.36,-.12,.50),(.39,-.16,.89),( .40,-.16,1.23)],.024,SILVER,parts['ArmR'],'Metal',4)
 elif kind in ['stormWarden','graveCaller','venomQueen']:
  col={'stormWarden':(.09,.16,.23,1),'graveCaller':(.17,.14,.10,1),'venomQueen':(.07,.24,.08,1)}[kind]
  insect_legs(root,8 if kind=='venomQueen'else 6,.38,.21,.38,col,.042)
  shell(body,(0,.10,.48),(.26,.31,.20),col,7);head=part('Head',root,(0,-.21,.46));bulb('PredatorHead',(0,-.25,.46),(.16,.13,.15),col,head,'PortalChitin',3);eyes(head,(0,-.38,.49),.041,YELLOW,.077);jaw(head,(0,-.39,.41),.11,True)
  if kind=='stormWarden':
   for s in [-1,1]:
    claw=part('Arm'+('L'if s<0 else'R'),root,(s*.20,-.12,.44));pipe('CrabForearm',[(s*.19,-.14,.40),(s*.36,-.25,.35),(s*.44,-.35,.53)],.066,col,claw,'PortalChitin');horns(claw,(s*.44,-.35,.50),.13,.24,SILVER)
   for j in range(5):g.crystal('LightningCrest',((j-2)*.08,.12,.61),.045,.27-.045*abs(j-2),BLUE,body)
  elif kind=='graveCaller':
   g.box('CarriedGravestone',(0,.16,.74),(.33,.15,.50),(.19,.21,.17,1),body,.035,'Stone');pipe('GraveCross',[(-.08,.075,.82),(.08,.075,.82)],.021,BONE,body);pipe('GraveCross',[(0,.075,.70),(0,.075,.94)],.021,BONE,body)
   for s in [-1,1]:d.branch('GraveRoot',[(s*.19,.22,.43),(s*.24,.26,.69),(s*.16,.21,.94)],.032,body,g.BARK,True)
  else:
   shell(body,(0,.36,.50),(.24,.27,.18),(.13,.025,.20,1),5);horns(head,(0,-.21,.60),.22,.28,TEAL,True)
   for j in range(6):a=j*2*pi/6;g.ellipsoid('VenomSac',(.22*cos(a),.15+.25*sin(a),.50),(.038,.036,.05),LIGHTGREEN,body,12,8,'Glow')
 elif kind in ['riftStalker','mossGolem','emberBoar','thornBeast']:
  col={'riftStalker':(.08,.028,.13,1),'mossGolem':(.15,.18,.09,1),'emberBoar':(.24,.027,.012,1),'thornBeast':(.16,.085,.024,1)}[kind]
  shell(body,(0,.08,.49),(.24,.42,.25),col,6)
  for j in range(2):
   for s in [-1,1]:leg(root,j*2+(s>0),(s*.16,-.16+j*.40,.42),(s*.25,-.15+j*.45,.24),(s*.27,-.25+j*.48,.05),col,.070)
  head=part('Head',root,(0,-.34,.51));bulb('HeavySnout',(0,-.37,.49),(.20,.23,.18),col,head,'PortalChitin',4);eyes(head,(0,-.51,.58),.05,YELLOW,.10);jaw(head,(0,-.60,.44),.13,True)
  if kind=='riftStalker':
   for s in [-1,1]:petal('RiftBlade',(s*.13,.08,.58),(s*.40,.15,.97),.10,PURPLE,body,.03,material='PortalChitin',veins=False)
   path=d.curve([(0,.40,.44),(.14,.65,.50),(.25,.67,.74),(.14,.57,.87)],6);g.tube('StalkerTail',path,[.047*(1-i/len(path))+.006 for i in range(len(path))],PURPLE,body,10,'PortalChitin');g.crystal('TailRift',path[-1],.06,.17,PURPLE,body)
  elif kind=='mossGolem':
   for j in range(9):a=j*2.399;d.roughstone('GrownStonePlate',(.24*cos(a),.26*sin(a),.55+.19*(j%2)),(.12,.17,.11),body,(.18,.20,.13,1));petal('MossLeaf',(.20*cos(a),.22*sin(a),.58),(.31*cos(a),.34*sin(a),.73),.034,GREEN,body,.035,material='PortalBamboo')
   horns(head,(0,-.27,.62),.27,.35,g.BARK,True)
  elif kind=='emberBoar':
   for j in range(8):
    y=-.18+j*.065;petal('BristledBack',(0,y,.67),((-.03 if j%2 else.04),y+.02,.83+.035*sin(j)),.055,IRON,body,.012,material='PortalChitin',veins=False)
   for s in [-1,1]:pipe('EmberCrack',[(s*.20,-.11,.55),(s*.23,.08,.59),(s*.18,.25,.58)],.007,YELLOW,body,'Glow',5)
   bulb('BoarNose',(0,-.57,.51),(.12,.05,.075),DARK,head,'PortalChitin')
  else:
   for j in range(8):a=j*2.399;d.branch('BriarSpine',[(.19*cos(a),.26*sin(a),.58),(.32*cos(a),.35*sin(a),.76),(.37*cos(a),.42*sin(a),.87)],.035,body,g.BARK,False)
   horns(head,(0,-.39,.58),.16,.39,g.BARK,True)
 elif kind=='portalSentinel':
  flying=True
  g.lathe('SentinelRiftRim',[(.27,0),(.33,.06),(.33,.12),(.23,.12),(.22,.06),(.27,0)],IRON,body,segments=48,material='Metal')
  # Tilt the aperture and keep its inward teeth physically distinct.
  for o in list(body.children):o.rotation_euler.x=pi/2;o.location.z=.78
  for j in range(10):
   a=j*2*pi/10;g.crystal('SentinelRune',(.27*cos(a),-.08,.78+.27*sin(a)),.025,.09,CYAN,body,4)
  g.ellipsoid('SentinelVoid',(0,-.005,.78),(.22,.025,.22),(.002,.012,.025,1),body,'Organic' if False else 24,14,'Organic')
  for s in [-1,1]:
   p=part('Arm'+('L'if s<0 else'R'),root,(s*.28,0,.74));g.mesh('FracturedShoulder',[(s*.23,-.05,.87),(s*.45,0,.97),(s*.51,.09,.77),(s*.32,.10,.63),(s*.40,-.10,.72)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],IRON,p,'Metal',False)
   pipe('SentinelBlade',[(s*.40,-.10,.72),(s*.49,-.11,.39),(s*.40,-.22,.12)],.038,SILVER,p,'Metal',4)
  for j in range(3):g.crystal('FloatingKeystone',((j-1)*.13,0,.18),.055,.22,CYAN,body)
 else:raise ValueError(kind)
 if kind in MINIS:
  refined.refine_quadruped(sys.modules[__name__],kind,root)
 height=.55 if kind in ['mite','slug'] else .72 if kind in REGULAR else 1.42 if kind not in ['chronoMoth','ironSnail','emberBoar'] else 1.22
 rig_and_export(root,kind,height,flying)

def rig_and_export(root,name,height,flying):
 bpy.context.view_layer.update();meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
 zs=[(o.matrix_world@v.co).z for o in meshes for v in o.data.vertices];lo=min(zs);factor=height/max(.01,max(zs)-lo)
 positions={};owners={}
 for obj in meshes:
  p=obj.parent
  while p and p.name not in parts:p=p.parent
  owners[obj]=p.name if p else'Body'
  world=obj.matrix_world.copy()
  for v in obj.data.vertices:q=world@v.co;v.co=(q.x*factor,q.y*factor,(q.z-lo)*factor)
  obj.parent=None;obj.matrix_world.identity()
 for n,(p,parent) in joints.items():positions[n]=((p[0]*factor,p[1]*factor,(p[2]-lo)*factor),parent)
 armdata=bpy.data.armatures.new(name+'Skeleton');arm=bpy.data.objects.new('Armature',armdata);bpy.context.collection.objects.link(arm);arm.parent=root
 bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 rootbone=armdata.edit_bones.new('Root');rootbone.head=(0,0,0);rootbone.tail=(0,0,.12)
 for n,(p,parent) in positions.items():b=armdata.edit_bones.new(n);b.head=p;b.tail=Vector(p)+Vector((0,0,.12))
 for n,(p,parent) in positions.items():armdata.edit_bones[n].parent=armdata.edit_bones.get(parent)or rootbone
 bpy.ops.object.mode_set(mode='OBJECT')
 for obj in meshes:
  obj.parent=arm;vg=obj.vertex_groups.new(name=owners[obj]);vg.add(list(range(len(obj.data.vertices))),1,'REPLACE');mod=obj.modifiers.new('Original native skeleton','ARMATURE');mod.object=arm
 # A compact renderer per material preserves all vertex groups and the native rig.
 groups={}
 for obj in meshes:groups.setdefault(obj.data.materials[0].name,[]).append(obj)
 for category,obs in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for obj in obs:obj.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();obs[0].name=name+'_'+category
 for p in list(parts.values()):
  if p.name in bpy.data.objects:bpy.data.objects.remove(p,do_unlink=True)
 arm.animation_data_create();bpy.context.scene.render.fps=24
 for actionname,frames in [('Idle',48),('Walk',24),('Attack',24),('Hit',12),('Death',30)]:
  action=bpy.data.actions.new(actionname);arm.animation_data.action=action
  for frame in range(1,frames+2,2):
   u=(frame-1)/frames;wave=sin(u*2*pi);strike=sin(min(1,u*1.5)*pi)
   for p in arm.pose.bones:
    p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0)
    if p.name=='Body':
     if actionname=='Idle':p.location.z=.018*factor*wave
     elif actionname=='Walk':p.location.z=(.012 if flying else .022)*factor*abs(wave);p.rotation_euler.y=.035*wave
     elif actionname=='Attack':p.rotation_euler.x=.16*strike;p.location.y=-.04*factor*strike
     elif actionname=='Hit':p.rotation_euler.y=.18*max(0,1-u)*sin(pi*u)
     elif actionname=='Death':p.rotation_euler.y=min(1,u*1.5)*1.3;p.location.z=-.12*factor*min(1,u*1.4)
    if p.name.startswith('Leg')and actionname=='Walk':p.rotation_euler.x=.40*sin(u*2*pi+(int(p.name[3:])%2)*pi);p.rotation_euler.y=.13*cos(u*2*pi+(int(p.name[3:])%2)*pi)
    if p.name.startswith('Wing')and actionname in ['Walk','Idle','Attack']:p.rotation_euler.y=(1 if p.name.endswith('L')else-1)*(.18+.40*wave)
    if p.name.startswith('Arm'):
     s=-1 if p.name.endswith('L')else 1
     if actionname=='Walk':p.rotation_euler.x=s*.20*wave
     if actionname=='Attack':p.rotation_euler.x=-.72*sin(pi*u);p.rotation_euler.z=s*.15*strike
    if p.name=='Head'and actionname in ['Walk','Idle']:p.rotation_euler.z=.07*wave
    if p.name=='Jaw':p.rotation_euler.x=(-.10-.14*abs(wave))if actionname=='Idle'else(-.55*strike if actionname=='Attack'else 0)
    p.keyframe_insert(data_path='rotation_euler',frame=frame);p.keyframe_insert(data_path='location',frame=frame)
  # All clip endpoints are keyed, so Unity's take ranges are deterministic.
 arm.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=49;bpy.context.scene.frame_set(1)
 g.export(root,name,True)
 g.manifest[-1].update({'originalRig':True,'height':height,'flight':flying,'bones':len(arm.pose.bones),'resource':'Carrot/Models/'+('Enemies/'if name in REGULAR else'Minibosses/')+name,'license':'Original artwork and original animation; no new third-party source mesh'})

def portal():
 g.clear();root=g.empty('portal');core=g.empty('Core',root);ring1=g.empty('Ring01',root);ring2=g.empty('Ring02',root);ring3=g.empty('Ring03',root);eye=g.empty('Eyeball',core)
 center=(0,0,1.17)
 # Nested sculpted basalt arch blocks, an inner bronze turbine, and a recessed void.
 for j in range(18):
  a=j*2*pi/18;rr=.70
  p=(rr*cos(a),0,center[2]+rr*sin(a));stone=d.roughstone('PortalVoussoir',p,(.18,.14,.14),ring1,(.075,.105,.12,1));stone.rotation_euler.y=-a
  for k in range(2):
   q=(p[0]*.93,-.145,p[2]+(k-.5)*.052);pipe('EngravedRune',[q,(q[0]+.038*cos(a),q[1],q[2]+.038*sin(a)),(q[0]+.023*cos(a+.9),q[1],q[2]+.023*sin(a+.9))],.009,CYAN,ring1,'Glow',5)
 for r,part,col,thick in [(.62,ring2,BRONZE,.033),(.53,ring3,COPPER,.025),(.45,core,TEAL,.025)]:
  o=g.ring('ConcentricAperture',r,0,col,part,thick,64,material='Metal');o.rotation_euler.x=pi/2;o.location=center
 for j in range(24):
  a=j*2*pi/24;r=.59
  pts=[(r*cos(a),-.08,center[2]+r*sin(a)),((r-.10)*cos(a+.055),-.13,center[2]+(r-.10)*sin(a+.055)),((r-.13)*cos(a+.11),-.14,center[2]+(r-.13)*sin(a+.11))]
  g.tube('InwardTooth',pts,[.036,.024,.001],SILVER,ring2,4,'Metal')
  if j%3==0:g.ellipsoid('PortalRuneLens',(.55*cos(a),-.13,center[2]+.55*sin(a)),(.025,.015,.025),CYAN,ring3,12,8,'Glow')
 g.ellipsoid('RecessedEventHorizon',(0,.03,center[2]),(.444,.035,.444),(.002,.008,.016,1),core,64,32,'Organic')
 # The center is a real sculpted whirlpool surface behind the rotor, not a flat disk.
 for j in range(5):
  pts=[]
  for k in range(28):
   f=k/27;a=j*2*pi/5+f*pi*2.8;r=.40*(1-f)+.02;pts.append((r*cos(a),-.015-.025*f,center[2]+r*sin(a)))
  g.tube('EventHorizonSpiral',pts,[.009*(1-k/35)for k in range(28)],(.007,.12,.16,1),eye,6,'Glow')
 for j in range(4):
  s=-1 if j%2 else 1;back=j//2;claw=g.empty('Claw'+str(j),root)
  path=d.curve([(s*.46,.04,center[2]-.35),(s*.65,.10+back*.15,.57),(s*.70,-.08+back*.30,.27),(s*.56,-.20+back*.36,.09)],6)
  g.tube('RootCable',path,[.065*(1-i/(len(path)+2))+.013 for i in range(len(path))],TEAL,claw,12,'PortalChitin')
  for k in range(3):
   point=Vector(path[-1]);end=point+Vector(((k-1)*.10,-.18,.015));g.tube('StoneTalon',[point,point.lerp(end,.55)+Vector((0,0,.035)),end],[.045,.032,.001],SILVER,claw,6,'Metal')
  for k in range(4):a=k*.9;pipe('CableFiligree',[(s*.58,.07+back*.15,.72),(s*.69,.08+back*.15,.55),(s*.73,-.02+back*.25,.33)],.005,GOLD,claw,'Metal',5)
 # Crown and fractured counterweights reinforce a readable challenge silhouette.
 for s in [-1,1]:
  g.crystal('PortalCrown',(s*.32,.02,1.92),.09,.26,CYAN,root,5)
  pipe('CrownHorn',[(s*.48,0,1.73),(s*.69,.03,1.91),(s*.61,.05,2.13)],.055,IRON,root,'Metal',6)
 # Geometry was authored in world-like object coordinates. Move the actual
 # motion pivots to the aperture/hip centres without changing the meshes.
 bpy.context.view_layer.update()
 for pivot,location in [(core,center),(ring1,center),(ring2,center),(ring3,center),(eye,center)]+[(bpy.data.objects['Claw'+str(j)],((1 if j%2==0 else -1)*.46,.04,.82))for j in range(4)]:
  children=[(child,child.matrix_world.copy())for child in pivot.children]
  world=pivot.matrix_world.copy();world.translation=Vector(location);pivot.matrix_world=world
  for child,matrix in children:child.matrix_world=matrix
  bpy.context.view_layer.update()
 g.export(root,'portal',False);g.manifest[-1].update({'resource':'Carrot/Models/Bosses/portal','proceduralPivots':['Core','Ring01','Ring02','Ring03','Eyeball','Claw0','Claw1','Claw2','Claw3'],'originalRig':False})

if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[]
 selected=args[0].split(',')if args and args[0]!='all'else REGULAR+MINIS+['portal']
 for kind in selected:
  if kind=='portal':portal()
  else:create(kind)
 output=g.ROOT/'Tools/portal-creature-manifest.json';old=json.loads(output.read_text())if output.exists()else[];items={i['name']:i for i in old}
 for entry in g.manifest:items[entry['name']]=entry
 output.write_text(json.dumps(list(items.values()),indent=2)+'\n')
