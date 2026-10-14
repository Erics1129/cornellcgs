"""Second anatomy pass, aligned to the Portal miniboss reference roster.
Independent silhouettes and actual surface relief; called before native rigging.
"""
import math, random
from math import sin,cos,pi
from mathutils import Vector
import bpy
import build_carrot_models as g
import sculpt_carrot_details as d
from build_portal_towers import petal,bulb,pipe,gear,GREEN,LIGHTGREEN,COPPER,BRONZE,SILVER,RED,PURPLE,CYAN,WHITE,DARK,GOLD,YELLOW

IRON=(.08,.12,.14,1);BONE=(.42,.36,.22,1);TEAL=(.025,.12,.13,1)

def clear_geometry(parent):
 for ob in list(parent.children):
  if ob.type=='MESH':bpy.data.objects.remove(ob,do_unlink=True)

def armour(parent,center,size,col=IRON):
 x,y,z=center;w,depth,h=size
 vs=[(x-w,y,z-h*.3),(x-w*.73,y,z+h*.42),(x,y-depth*.55,z+h*.57),(x+w*.73,y,z+h*.42),(x+w,y,z-h*.3),(x,y-depth,z-h*.5),(x,y-depth*1.12,z+h*.14),(x,y+depth*.15,z)]
 fs=[(0,1,6),(1,2,6),(2,3,6),(3,4,6),(4,5,6),(5,0,6),(1,0,7),(2,1,7),(3,2,7),(4,3,7),(5,4,7),(0,5,7)]
 ob=g.mesh('ForgedArmourPlate',vs,fs,col,parent,'Metal',False)
 bpy.context.view_layer.objects.active=ob
 bevel=ob.modifiers.new('Forged rolled edges','BEVEL');bevel.width=.012;bevel.segments=3;bpy.ops.object.modifier_apply(modifier=bevel.name)
 for polygon in ob.data.polygons:polygon.use_smooth=True
 weighted=ob.modifiers.new('Broad steel face normals','WEIGHTED_NORMAL');weighted.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=weighted.name)
 for a,b in [(0,1),(1,2),(2,3),(3,4),(4,5),(5,0)]:pipe('ArmourEdge',[vs[a],vs[b]],.006,GOLD,parent,'Metal',5)
 return ob

def skull(c,parent,z=1.1,long=False,col=BONE):
 bulb('Cranium',(0,-.005,z+.075),(.14,.13,.16),col,parent,'PortalChitin',4,28,18)
 # Cheekbones converge into a long nasal wedge rather than another spherical face.
 drop=.24 if long else .13
 vs=[(-.11,-.11,z+.10),(.11,-.11,z+.10),(.083,-.18,z-.02),(.052,-.22,z-drop),(-.052,-.22,z-drop),(-.083,-.18,z-.02),(0,-.21,z+.09)]
 g.mesh('SkullNasalWedge',vs,[(0,1,6),(1,2,6),(2,3,6),(3,4,6),(4,5,6),(5,0,6)],col,parent,'PortalChitin',True)
 for s in [-1,1]:
  g.ellipsoid('RecessedSkullOrbit',(s*.083,-.136,z+.035),(.053,.024,.063),DARK,parent,20,12)
  g.ellipsoid('SkullEye',(s*.083,-.16,z+.039),(.015,.012,.022),CYAN,parent,12,8,'Glow')
  pipe('SkullCrack',[(s*.03,-.136,z+.19),(s*.075,-.145,z+.12),(s*.056,-.15,z+.08)],.004,DARK,parent,'Organic',4)
 for s in [-1,1]:g.ellipsoid('NasalCavity',(s*.020,-.225,z-drop+.015),(.012,.009,.025),DARK,parent,12,8)

def fringes(parent,origin,width,length,count,col,material='PortalCap'):
 x,y,z=origin
 for j in range(count):
  a=j*2.399;offset=(j/(count-1)-.5)*width
  start=(x+offset,y+.015*sin(a),z+.025*cos(a));end=(x+offset+.03*sin(a),y-.05,z-length*(.7+.3*sin(a)**2))
  petal('LayeredRaggedFringe',start,end,width/count*.82,col,parent,.03,twist=.01*sin(a),material=material,veins=False)

def face_helmet(parent,z=1.10):
 armour(parent,(0,-.04,z),(.155,.12,.24),IRON)
 pipe('VisorSlit',[(-.09,-.19,z+.04),(0,-.21,z+.03),(.09,-.19,z+.04)],.008,CYAN,parent,'Glow',5)
 pipe('VisorNose',[(0,-.22,z+.16),(0,-.22,z-.13)],.009,GOLD,parent,'Metal',5)

def standing(c,root,col,robe=False,headtype='skull'):
 body,head=c.humanoid(root,col,robe);clear_geometry(head)
 if headtype=='helmet':face_helmet(head)
 else:skull(c,head,1.10,headtype=='deer')
 return body,head

def build(c,kind,root):
 body=c.parts['Body'];flying=False
 if kind=='warDrummer':
  body,head=standing(c,root,(.12,.15,.055,1));c.cap(head,(0,0,1.30),.32,(.40,.035,.012,1))
  fringes(body,(0,-.16,.86),.50,.27,9,(.17,.10,.035,1));fringes(body,(0,.14,.71),.45,.39,9,(.22,.11,.035,1))
  for j in range(7):
   x=(j-3)*.054;d.barkplate(body,x,-.15,.95-.04*(j%2),.20+.04*(j%3),.052,.02*sin(j))
  for s in [-1,1]:
   for j in range(3):pipe('DrummerToeClaw',[(s*.19+(j-1)*.032,-.13,.07),(s*.19+(j-1)*.041,-.24,.025)],.012,BONE,c.parts['Leg'+str(0 if s<0 else 1)])
  drum=c.part('Drum',root,(0,-.33,.58));g.lathe('WarDrum',[(.23,0),(.26,.10),(.25,.33),(.22,.35)],(.18,.06,.018,1),drum,(0,-.33,.42),36,'Bark',lobes=10)
  g.lathe('StretchedDrumHead',[(.22,.35),(.22,.355)],(.47,.31,.11,1),drum,(0,-.33,.42),36,'PortalCap')
  for j in range(12):
   a=j*2*pi/12;pipe('DrumRope',[(.24*cos(a),-.33+.24*sin(a),.44),(.26*cos(a+.18),-.33+.26*sin(a+.18),.59),(.235*cos(a),-.33+.235*sin(a),.76)],.007,BONE,drum)
   if j%2==0:g.tube('DrumBone',[(.26*cos(a),-.33+.26*sin(a),.69),(.255*cos(a),-.33+.255*sin(a),.51)],[.020,.011],BONE,drum,7)
  for s,label in [(-1,'ArmL'),(1,'ArmR')]:
   pipe('RaisedMallet',[(s*.37,-.10,.61),(s*.36,-.25,1.03)],.020,g.BARK,c.parts[label],'Bark');bulb('MalletKnob',(s*.36,-.25,1.03),(.072,.06,.07),BONE,c.parts[label],segments=16,rings=10)
 elif kind=='frostHerald':
  body,head=standing(c,root,(.05,.095,.12,1),True,'deer')
  for s in [-1,1]:
   points=[(s*.095,.015,1.23),(s*.22,.03,1.47),(s*.36,.035,1.62),(s*.44,0,1.83)]
   d.branch('FrostAntler',points,.038,head,BONE,True)
   for j in range(3):d.branch('AntlerTine',[(s*(.17+j*.09),.02,1.4+j*.14),(s*(.27+j*.09),.04,1.57+j*.13),(s*(.20+j*.13),-.01,1.67+j*.14)],.017,head,BONE,False)
   for j in range(7):
    a=j*.52;petal('FrostFurLock',(s*(.13+.025*j),.035,.98-.018*j),(s*(.22+.029*j),-.03,.64-.038*j),.035,(.52,.59,.56,1),body,.045,material='PortalCap',veins=False)
  for j in range(13):
   a=j*2.399;rr=.20;g.crystal('RobeIcicle',(rr*cos(a),rr*sin(a),.21+.23*(j%3)),.012,.14,CYAN,body,4)
  for row in range(4):
   for j in range(12):
    a=j*2*pi/12+.16*(row%2);z=.91-row*.17;r=.19+.025*row
    d.fur(body,(r*cos(a),r*.82*sin(a),z),(.18*cos(a),.20*sin(a),-1),.19+.02*sin(j),.024,(.60,.68,.67,1))
  staff=c.parts['ArmR'];d.branch('IceCrook',[(.44,-.07,.08),(.43,-.05,.79),(.47,-.03,1.32)],.024,staff,g.BARK,True);g.crystal('HeraldStaff',(.47,-.03,1.31),.075,.33,CYAN,staff)
 elif kind=='witherPriest':
  body,head=standing(c,root,(.07,.085,.026,1),True);clear_geometry(head)
  bulb('EmptyHood',(0,-.045,1.12),(.15,.14,.24),(.055,.031,.014,1),head,'Bark',5)
  g.ellipsoid('HoodVoid',(0,-.171,1.13),(.092,.025,.17),DARK,head,24,16)
  for s in [-1,1]:g.ellipsoid('WitherEye',(s*.041,-.198,1.19),(.012,.008,.027),LIGHTGREEN,head,10,8,'Glow')
  for j in range(12):
   a=j*2*pi/12;d.branch('HangingRootRobe',[(.11*cos(a),.08*sin(a),1.05),(.14*cos(a),.12*sin(a),.60),(.29*cos(a+.12),.25*sin(a+.12),.11)],.018,body,g.BARK,True)
  for row in range(2):
   for j in range(7):
    x=(j-3)*.072;y=-.15-row*.085;d.barkplate(body,x,y,.89-row*.25,.35+.06*sin(j*1.7),.095,.02*sin(j))
  for s in [-1,1]:d.branch('HoodRootBorder',[(s*.06,-.18,.93),(s*.13,-.15,1.10),(s*.08,-.07,1.34),(0,-.015,1.38)],.016,head,g.BARK,True)
  for s in [-1,1]:
   d.branch('WitherShoulderBranch',[(s*.12,.03,.89),(s*.35,.07,1.03),(s*.48,.11,1.26),(s*.44,.06,1.42)],.033,body,g.BARK,True)
   for j in range(4):petal('DeadLeaf',(s*(.30+j*.035),.1,1.10+j*.06),(s*(.31+j*.043),.07,.99+j*.055),.035,(.22,.08,.023,1),body,.015,material='PortalBamboo',veins=False)
  staff=c.parts['ArmR'];d.branch('WitherCrook',[(.42,-.08,.08),(.47,-.07,.8),(.45,-.05,1.40),(.32,-.08,1.48)],.023,staff,g.BARK,True);d.lantern(staff,(.32,-.08,1.22),.75)
 elif kind in ['stormWarden','mirrorKnight','portalSentinel']:
  body,head=standing(c,root,(.055,.075,.08,1),False,'helmet');clear_geometry(body)
  armour(body,(0,-.055,.76),(.25,.17,.33),(.12,.19,.21,1));armour(body,(0,-.05,.46),(.18,.13,.18),IRON)
  for s,label in [(-1,'ArmL'),(1,'ArmR')]:
   p=c.parts[label];armour(p,(s*.25,.01,.96),(.17,.11,.21),IRON);armour(p,(s*.36,-.07,.70),(.085,.07,.18),SILVER)
   leg=c.parts['Leg'+str(0 if s<0 else 1)];armour(leg,(s*.19,-.07,.24),(.087,.07,.23),IRON);armour(leg,(s*.19,-.16,.068),(.09,.12,.095),IRON)
  fringes(body,(0,.12,.52),.34,.38,8,(.028,.044,.056,1))
  for j in range(4):gear('ArmourGear',((j%2*2-1)*.10,-.23,.67+.13*(j//2)),.036,body,8)
  if kind=='stormWarden':
   for s in [-1,1]:
    for j in range(6):g.ring('TeslaCoil',.075-.004*j,1.05+j*.05,COPPER,body,.012,24,(s*.29,.025))
    g.ellipsoid('TeslaTerminal',(s*.29,.025,1.35),(.05,.05,.036),CYAN,body,16,10,'Glow')
   p=c.parts['ArmR'];pipe('HammerShaft',[(.39,-.13,.35),(.41,-.17,1.00)],.026,BRONZE,p,'Metal');g.box('WarhammerHead',(.41,-.17,1.03),(.30,.17,.18),IRON,p,.02,'Metal');pipe('HammerRune',[(.29,-.26,1.05),(.36,-.26,1.05),(.39,-.26,.99),(.43,-.26,1.07),(.52,-.26,1.07)],.008,CYAN,p,'Glow',5)
  else:
   p=c.parts['ArmL'];armour(p,(-.39,-.19,.68),(.20,.08,.45),SILVER if kind=='mirrorKnight'else IRON)
   if kind=='mirrorKnight':
    # Mosaic faces are real separate inset facets across the shield and breastplate.
    for row in range(4):
     for j in range(3):
      x=-.51+j*.11;z=.43+row*.12;g.mesh('MirrorFacet',[(x,-.28,z),(x+.10,-.28,z+.02),(x+.045,-.31,z+.13)],[(0,1,2)],(.42+.07*(j%2),.52,.57,1),p,'Metal',False)
   else:
    o=g.ring('SentinelShieldPortal',.18,0,BRONZE,p,.020,48);o.rotation_euler.x=pi/2;o.location=(-.39,-.31,.68)
    g.ellipsoid('SentinelShieldVoid',(-.39,-.311,.68),(.168,.017,.168),(.002,.021,.04,1),p,32,20)
    for j in range(12):a=j*2*pi/12;g.ellipsoid('ShieldRune',(-.39+.20*cos(a),-.32,.68+.20*sin(a)),(.011,.007,.011),CYAN,p,8,6,'Glow')
    for s in [-1,1]:
     path=d.curve([(s*.21,.04,1.05),(s*.39,.07,1.28),(s*.34,.05,1.48)],5);g.tube('SentinelCrescentPauldron',path,[.06*(1-i/(len(path)+1))+.005 for i in range(len(path))],IRON,body,6,'Metal')
   pipe('KnightSword',[(.38,-.13,.48),(.41,-.15,.95),(.40,-.17,1.33)],.028,SILVER,c.parts['ArmR'],'Metal',4)
 elif kind in ['graveCaller','mossGolem']:
  body,head=standing(c,root,(.09,.13,.046,1),False);clear_geometry(body);clear_geometry(head)
  if kind=='graveCaller':
   d.branch('RootTorso',[(0,.01,.42),(-.035,.04,.75),(0,.03,1.10)],.17,body,g.BARK,True);skull(c,head,1.10,True,(.23,.25,.11,1))
   for s in [-1,1]:
    g.box('CarriedHeadstone',(s*.25,.09,1.04),(.20,.13,.38),(.15,.18,.12,1),body,.015,'Stone')
    pipe('StoneInscription',[(s*.25-.045,.018,1.10),(s*.25+.045,.018,1.10)],.006,BONE,body);pipe('StoneInscription',[(s*.25,.018,.99),(s*.25,.018,1.18)],.006,BONE,body)
    d.branch('TombBough',[(s*.15,.05,.75),(s*.35,.1,.97),(s*.43,.10,1.15)],.029,body,g.BARK,True)
    fringes(body,(s*.17,-.08,.86),.25,.44,8,(.19,.16,.07,1),'Bark')
    for j in range(4):d.branch('FingerRoot',[(s*.36+(j-1.5)*.027,-.11,.59),(s*.39+(j-1.5)*.035,-.14,.46),(s*.36+(j-1.5)*.044,-.19,.40)],.011,c.parts['Arm'+('L'if s<0 else'R')],g.BARK,False)
   d.lantern(c.parts['ArmR'],(.39,-.1,.35),1)
  else:
   # Crouched shoulders and heavy irregular slabs replace the smooth barrel body.
   for row in range(3):
    for j in range(4):
     a=j*pi/2+.25*(row%2);d.roughstone('LoadBearingStone',(.18*cos(a),.14*sin(a),.55+row*.16),(.16,.14,.14),body,(.16,.19,.12,1))
   d.roughstone('GolemHead',(0,-.03,1.09),(.17,.17,.18),head,(.22,.25,.17,1))
   for s in [-1,1]:
    g.ellipsoid('GolemEye',(s*.059,-.195,1.10),(.018,.011,.012),LIGHTGREEN,head,12,8,'Glow')
    arm=c.parts['Arm'+('L'if s<0 else'R')]
    for j in range(3):d.roughstone('GolemArmBoulder',(s*(.25+.05*j),-.025-.04*j,.94-.14*j),(.14,.15,.14),arm,(.16,.19,.12,1))
    leg=c.parts['Leg'+str(0 if s<0 else 1)]
    d.roughstone('GolemShin',(s*.19,-.02,.27),(.13,.13,.19),leg,(.19,.22,.14,1));d.roughstone('GolemFoot',(s*.19,-.13,.09),(.14,.20,.09),leg,(.19,.22,.14,1))
    for j in range(3):d.branch('StoneBindingRoot',[(s*.12,-.15,.90-j*.12),(s*.23,-.15,.82-j*.12),(s*.24,-.02,.75-j*.12)],.019,body,g.BARK,True)
   for j in range(25):
    a=j*2.399;x=.23*cos(a);y=.19*sin(a);z=.57+.38*(j%5)/4
    petal('GolemFern',(x,y,z),(x+.065*cos(a),y+.075*sin(a),z+.09),.020,GREEN,body,.025,material='PortalBamboo')
   g.crystal('GolemHeart',(0,-.18,.68),.07,.18,LIGHTGREEN,body)
 elif kind=='venomQueen':
  # Upright mantis: tiny triangular head, elongated thorax and swept sickle arms.
  c.insect_legs(root,4,.36,.13,.30,TEAL,.029)
  pipe('MantisThorax',[(0,.05,.28),(0,.025,.55),(0,-.045,.92)],.075,TEAL,body,'PortalChitin',14)
  c.shell(body,(0,.22,.43),(.15,.26,.14),(.16,.018,.13,1),6)
  head=c.part('Head',root,(0,-.055,.98));g.mesh('MantisTriangle',[(-.16,-.035,1.07),(.16,-.035,1.07),(0,-.13,.87),(0,.075,1.0)],[(0,1,2),(0,3,1),(1,3,2),(2,3,0)],TEAL,head,'PortalChitin',True)
  for s in [-1,1]:
   bulb('CompoundEye',(s*.125,-.064,1.045),(.050,.047,.058),LIGHTGREEN,head,'Glow',5,20,12);c.antenna(head,(s*.08,.005,1.07),s,.29)
   p=c.part('Arm'+('L'if s<0 else'R'),root,(s*.055,-.015,.84))
   pipe('MantisUpperArm',[(s*.06,-.015,.85),(s*.28,-.02,.72),(s*.37,-.07,1.05)],.035,GREEN,p,'PortalChitin')
   path=d.curve([(s*.37,-.07,1.05),(s*.47,-.17,.98),(s*.38,-.24,.65)],5);g.tube('SerratedSickle',path,[.05*(1-i/(len(path)+1))+.003 for i in range(len(path))],GREEN,p,8,'PortalChitin')
   for j in range(6):g.tube('SickleTooth',[(s*(.42-.008*j),-.18,.94-j*.039),(s*(.37-.005*j),-.20,.915-j*.039)],[.011,.001],BONE,p,5)
   for j in range(3):petal('OrchidWing',(s*.035,.06,.77),(s*(.20+.06*j),.18,.25+.055*j),.065,(.29,.018,.17,1),body,.03,material='Petal')
 elif kind=='lanternLeech':
  flying=True
  path=d.curve([( .26,.02,.11),(.16,.01,.26),(-.11,.04,.42),(-.14,.015,.74),(0,-.10,1.02),(.05,-.15,1.06)],7)
  r=[.025+.12*sin(pi*i/(len(path)-1))**.58 for i in range(len(path))];g.tube('LampreyBody',path,r,(.048,.066,.035,1),body,20,'PortalChitin')
  head=c.part('Head',root,(.04,-.14,1.02));o=g.ring('CircularMaw',.14,0,(.24,.050,.025,1),head,.036,48,material='PortalChitin');o.rotation_euler.x=pi/2;o.location=(.04,-.20,1.02)
  g.ellipsoid('MawInterior',(.04,-.18,1.02),(.125,.015,.125),DARK,head,28,16)
  for row in range(2):
   for j in range(15):
    a=j*2*pi/15;r=.125-row*.035;g.tube('LampreyTooth',[(.04+r*cos(a),-.236,1.02+r*sin(a)),(.04+(r-.035)*cos(a+.03),-.265,1.02+(r-.035)*sin(a+.03))],[.011,.001],BONE,head,6)
  pipe('LanternHook',[(.02,.015,.96),(.19,.03,1.23),(.39,-.03,1.25),(.43,-.07,1.04)],.025,BRONZE,body,'Metal');d.lantern(body,(.43,-.07,.76),1)
  for j in range(11):
   f=j/(11-1);i=int(f*(len(path)-1));q=Vector(path[i]);s=(-1 if j%2 else 1);pipe('LeechFilament',[tuple(q),(q.x+s*.16,q.y+.06,q.z-.08),(q.x+s*.15,q.y+.07,q.z-.18)],.009,TEAL,body,'PortalChitin',6)
 elif kind=='chronoMoth':
  flying=True;c.shell(body,(0,0,.57),(.075,.11,.25),(.13,.10,.03,1),7)
  for side,label in [(-1,'WingL'),(1,'WingR')]:
   wing=c.part(label,root,(side*.05,0,.65))
   for upper in [0,1]:
    z=.57 if upper else.42;end=(side*.65,.02,.94 if upper else.19)
    petal('ChronoMembrane',(side*.04,.025,z),end,.25,(.54,.45,.22,1),wing,.03,material='Petal')
    center=(side*(.40 if upper else.32),-.08,.78 if upper else.31)
    g.ellipsoid('ClockWingDial',center,(.135,.012,.135),(.58,.51,.31,1),wing,32,16)
    o=g.ring('ClockWingRim',.135,0,BRONZE,wing,.012,36);o.rotation_euler.x=pi/2;o.location=center
    for j in range(12):a=j*2*pi/12;pipe('WingClockMark',[(center[0]+.11*sin(a),-.101,center[2]+.11*cos(a)),(center[0]+.122*sin(a),-.101,center[2]+.122*cos(a))],.003,DARK,wing,'Organic',4)
    pipe('WingClockHand',[center,(center[0]+.08,-.10,center[2]+.05)],.004,DARK,wing,'Organic',4)
   c.antenna(body,(side*.04,-.03,.83),side,.26,CYAN)
  g.lathe('HourglassBody',[(.065,0),(.058,.04),(.016,.13),(.058,.22),(.065,.25)],CYAN,body,(0,-.10,.31),24,'Glow')
 else:
  # Quadruped species retain their individually constructed gait, with stronger
  # heads and overlapping plates instead of reusing the round cartoon face.
  return False
 c.rig_and_export(root,kind,1.48 if kind not in ['chronoMoth','lanternLeech']else 1.30,flying)
 return True

def refine_quadruped(c,kind,root):
 body=c.parts['Body'];head=c.parts.get('Head')
 if kind=='ironSnail':
  bulb('SolidShellDome',(0,.09,.43),(.31,.11,.31),(.15,.17,.12,1),body,'Metal',6,36,22)
  for j in range(16):a=j*2*pi/16;g.ellipsoid('ShellBolt',(.30*cos(a),-.035,.43+.30*sin(a)),(.014,.012,.014),GOLD,body,8,5,'Metal')
  if head:
   clear_geometry(head)
   for s in [-1,1]:
    c.antenna(head,(s*.08,-.28,.34),s,.28,YELLOW)
    bulb('SnailLip',(s*.055,-.35,.25),(.075,.04,.032),TEAL,head,'PortalChitin',0,16,10)
  return
 if kind not in ['riftStalker','emberBoar','thornBeast']:return
 if head:clear_geometry(head)
 if kind=='riftStalker':
  g.mesh('StalkerSkull',[(-.15,-.25,.64),(.15,-.25,.64),(.19,-.43,.52),(.09,-.62,.46),(-.09,-.62,.46),(-.19,-.43,.52),(0,-.44,.71)],[(0,1,6),(1,2,6),(2,3,6),(3,4,6),(4,5,6),(5,0,6)],IRON,head,'PortalChitin',False)
  for s in [-1,1]:pipe('RiftEyeSlit',[(s*.09,-.53,.54),(s*.14,-.42,.59)],.011,CYAN,head,'Glow',5)
  for row in range(5):
   y=-.18+row*.13
   for s in [-1,1]:armour(body,(s*.11,y,.68-.024*abs(row-2)),(.10,.055,.16),IRON)
  for s in [-1,1]:
   o=g.ring('StalkerPhaseCore',.105,0,CYAN,body,.011,32,material='Glow');o.rotation_euler=(pi/2,0,pi/2);o.location=(s*.265,.10,.51)
 elif kind=='emberBoar':
  bulb('BoarFace',(0,-.35,.48),(.18,.21,.17),(.17,.055,.027,1),head,'PortalChitin',5,28,18);bulb('BoarNasalDisc',(0,-.57,.45),(.13,.049,.087),(.032,.026,.022,1),head,'PortalChitin',0,28,16)
  for s in [-1,1]:
   g.ellipsoid('BoarNostril',(s*.047,-.619,.45),(.026,.009,.019),DARK,head,12,8)
   g.ellipsoid('BoarEye',(s*.139,-.41,.56),(.016,.020,.010),YELLOW,head,12,8,'Glow')
   p=d.curve([(s*.14,-.48,.40),(s*.23,-.52,.42),(s*.25,-.55,.65),(s*.18,-.56,.72)],6);g.tube('MoltenBoarTusk',p,[.032*(1-i/(len(p)+1))+.003 for i in range(len(p))],(.60,.19,.02,1),head,10,'Glow')
   petal('BoarEar',(s*.13,-.19,.63),(s*.22,-.10,.77),.08,(.08,.04,.018,1),head,.035,material='PortalChitin',veins=False)
  for j in range(30):
   a=j*2.399;x=.20*cos(a);y=.33*sin(a);z=.57+.08*cos(a);p=d.curve([(x,y,z),(x*1.08,y+.035,z+.10),(x*.8,y+.065,z+.20)],3);g.tube('CharredBristle',p,[.022,.021,.016,.009,.003,.002,.001][:len(p)],IRON,body,5,'PortalChitin')
 else:
  bulb('BriarBearHead',(0,-.36,.54),(.205,.18,.21),(.14,.067,.024,1),head,'Bark',5,28,18)
  bulb('BearMuzzle',(0,-.52,.48),(.12,.09,.085),(.23,.13,.052,1),head,'Bark',3,20,14);bulb('BearNose',(0,-.606,.51),(.065,.018,.037),DARK,head,'PortalChitin',0,16,10)
  for s in [-1,1]:
   bulb('BearEar',(s*.16,-.27,.72),(.07,.04,.067),(.13,.057,.02,1),head,'Bark',0,18,12);g.ellipsoid('BearEye',(s*.082,-.506,.60),(.012,.012,.012),YELLOW,head,12,8,'Glow')
  for j in range(42):
   a=j*2.399;x=.23*cos(a);y=.37*sin(a);z=.53+.12*cos(a*.7)
   d.branch('BriarMane',[(x,y,z),(x*1.34,y*1.16,z+.13),(x*1.5,y*1.28,z+.23+.08*sin(j))],.016,body,g.BARK,False)
