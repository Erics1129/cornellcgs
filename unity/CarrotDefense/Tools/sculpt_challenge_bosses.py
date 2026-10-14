"""Challenge-boss anatomy for the animated Gravewalker Zombie (challenge 26).
The gaunt body reuses the blended-skin part names (LivingTrunk, TwistedArm, LegMuscle)
so build_carrot_characters binds it across the licensed Mushroom King skeleton.
Real geometry only: swept limbs, a remeshed and decimated skull, rib plates, cloth panels.
"""
import bpy,math
from math import sin,cos,pi
import build_carrot_models as g
from sculpt_carrot_details import branch,fuse,eyelid,clothplate,straw_tuft,curve

PALETTE=(.46,.55,.38,1);BURLAP=(.30,.24,.16,1);PUMPKIN=(.80,.42,.12,1);BONE=(.80,.76,.62,1);DARK=(.06,.045,.03,1);SOCKET=(.55,1,.35,1);ROPE=(.50,.40,.24,1)

def zombie(parent):
 # Gaunt torso: a crooked trunk, hunched shoulders and a sunken chest; shoulders lean forward 6 degrees.
 branch('LivingTrunk',[(.02,.05,.62),(-.03,.02,.95),(.03,-.02,1.28),(0,-.08,1.58)],.26,parent,PALETTE,True)
 g.ellipsoid('LivingTrunkShoulders',(0,-.04,1.52),(.46,.26,.18),PALETTE,parent,24,14)
 for s in [-1,1]:
  shoulder=(s*.42,-.05,1.50);elbow=(s*.66,-.22,1.12);wrist=(s*.64,-.58,.86)
  if s>0:
   # The raised grasping arm reaches forward at chest height.
   branch('TwistedArm',[shoulder,(s*.56,-.12,1.38),elbow,(s*.66,-.42,.98),wrist],.17,parent,PALETTE,False)
   for j in range(4):branch('GraspingRoot',[wrist,(s*(.60+(j-1.5)*.06),-.70,.80),(s*(.58+(j-1.5)*.09),-.78,.70)],.035,parent,g.WOOD,False)
  else:
   # The other arm hangs torn and low, swinging from a shoulder stump.
   branch('TwistedArm',[shoulder,(s*.52,-.02,1.30),(s*.58,-.04,1.06)],.15,parent,PALETTE,False)
   branch('HangingArm',[(s*.58,-.04,1.06),(s*.60,-.10,.70),(s*.56,-.20,.36)],.12,parent,PALETTE,False)
   for j in range(4):branch('GraspingRoot',[(s*.56,-.20,.36),(s*(.56+(j-1.5)*.05),-.26,.22),(s*(.55+(j-1.5)*.08),-.30,.12)],.03,parent,g.WOOD,False)
  g.tube('LegMuscle',curve([(s*.16,.02,.66),(s*.21,-.02,.38),(s*.22,-.08,.14)],5),[.16-(i/10)*.03 for i in range(11)],PALETTE,parent,12)
  g.ellipsoid('BootFoot',(s*.23,-.14,.08),(.14,.22,.08),DARK,parent,16,10)
  straw_tuft(parent,(s*.22,-.08),.20,8,.12)
  straw_tuft(parent,(s*.42,-.05),1.52,8,.14,.08)
 # Exposed rib plates across a sunken chest.
 for j in range(6):
  s=-1 if j%2 else 1;z=1.40-(j//2)*.11;g.leaf('RibPlate',(s*.03,-.28,z),(s*.30,-.22,z-.07),.045,BONE,parent,.04,'Organic')
 # Burlap rags: hanging panels around the torso plus a rope belt.
 for row in range(2):
  for j in range(7):
   a=2*pi*(j+.5*(row%2))/7;r=.42-.02*row;z=1.38-row*.24
   clothplate(parent,r*cos(a),r*sin(a),z,.30,.22,BURLAP,.006*sin(j),'BurlapPanel')
 clothplate(parent,0,.40,1.42,.70,.38,BURLAP,0,'BurlapPanel')
 clothplate(parent,-.12,-.38,1.42,.34,.22,BURLAP,-.01,'BurlapPanel')
 g.ring('RopeBelt',.33,.80,ROPE,parent,.022,28,(0,0),'Organic')
 straw_tuft(parent,(0,.0),.78,12,.14,.30)
 # Skull: a pumpkin-cracked cranium and jaw fused into one continuous head, then budgeted.
 lobes=[g.ellipsoid('PumpkinLobe',(.24*cos(a),-.10+.22*sin(a),1.88),(.15,.13,.27),PUMPKIN,parent,12,8) for a in [k*2*pi/6+.3 for k in range(6)]]
 head=fuse('SkullHead',lobes+[g.ellipsoid('Skull',(0,-.10,1.86),(.30,.27,.30),PUMPKIN,parent,24,16),g.ellipsoid('Jaw',(0,-.19,1.66),(.20,.18,.15),PUMPKIN,parent,24,16),g.ellipsoid('Cheek',(-.17,-.24,1.78),(.09,.08,.08),PUMPKIN,parent,12,8),g.ellipsoid('Cheek',(.17,-.24,1.78),(.09,.08,.08),PUMPKIN,parent,12,8)],parent,PUMPKIN,.028)
 mod=head.modifiers.new('Challenge budget','DECIMATE');mod.ratio=.5;bpy.context.view_layer.objects.active=head;bpy.ops.object.modifier_apply(modifier=mod.name)
 for j in range(3):
  a=-.9+j*.9;g.tube('SkullCrack',[(.26*cos(a),-.10+.26*sin(a),2.02),(.30*cos(a+.2),-.10+.28*sin(a+.2),1.90),(.27*cos(a+.1),-.10+.27*sin(a+.1),1.78)],[.012,.016,.008],DARK,parent,5)
 for s in [-1,1]:eyelid(parent,s*.11,-.36,1.92,.06,PUMPKIN,SOCKET)
 g.ellipsoid('MouthCavity',(0,-.39,1.70),(.14,.03,.07),DARK,parent,16,8)
 for j in range(6):
  x=(j-2.5)*.045;g.box('Tooth',(x,-.40,1.74 if j%2==0 else 1.67),(.025,.025,.035),BONE,parent,.003)
 g.tube('PumpkinStem',[(0,-.02,2.14),(.03,-.04,2.22),(.07,-.06,2.26)],[.035,.028,.015],(.25,.35,.12,1),parent,8)
 for j in range(10):
  a=j*2.399;g.ellipsoid('MossClump',(.30*cos(a),.25*sin(a)-.05,1.90+.12*sin(a*.8)),(.045,.04,.025),(.30,.42,.14,1),parent,8,5)
 # A crow on the left shoulder.
 g.ellipsoid('CrowBody',(-.46,-.06,1.68),(.065,.11,.06),DARK,parent,12,8)
 g.ellipsoid('CrowHead',(-.46,-.16,1.75),(.045,.05,.045),DARK,parent,10,7)
 g.leaf('CrowBeak',(-.46,-.20,1.75),(-.46,-.26,1.74),.025,(.85,.65,.2,1),parent,0,'Organic',N=4)
 g.leaf('CrowTail',(-.46,.02,1.69),(-.47,.16,1.72),.05,DARK,parent,.02,'Organic',N=5)
 g.ellipsoid('CrowEye',(-.43,-.19,1.765),(.01,.01,.01),SOCKET,parent,6,4,'Glow')
