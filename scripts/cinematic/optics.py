import bpy, math, random
from mathutils import Vector
from common import *

def processor():
    studio(True)
    graphite=material('Anodised midnight aluminium',(.018,.035,.055),.82,.25,texture=.10)
    glass=material('Optical cyan glass',(.08,.38,.51),.4,.18,.14)
    gold=material('Electroplated contacts',(.73,.43,.16),.85,.24,texture=.08)
    ice=material('Light inside fibre',(.22,.78,1),.25,.2,emission=4)
    amber=material('Warm signal',(.95,.36,.07),.3,.2,emission=3)
    board=box('Layered substrate',(0,0,.22),(5.9,5.9,.32),graphite,.18)
    box('Processor ceramic carrier',(0,0,.49),(2.45,2.45,.17),graphite,.12)
    chip=box('Polished silicon die',(0,0,.62),(1.75,1.75,.16),material('Silicon',(.023,.08,.11),.9,.16),.05)
    # Interconnected traces, laser grooves, ceramic components and stepped pins.
    for side in range(4):
        a=side*TAU/4; rot=lambda x,y:(x*math.cos(a)-y*math.sin(a),x*math.sin(a)+y*math.cos(a))
        for i in range(17):
            x=(i-8)*.13; px,py=rot(x,1.24)
            pin=box('Gold bond contact',(px,py,.51),(.065,.36,.055),gold,.007);pin.rotation_euler.z=a
        for i in range(26):
            off=(i-12.5)*.094
            points=[]
            for j in range(49):
                u=j/48; y=1.32+u*3.5; x=off*(1+u*.65)+.34*math.sin(u*math.pi)
                px,py=rot(x,y);z=.46+.16*math.sin(u*math.pi)+u*u*.7
                points.append((px,py,z))
            curve('Individually routed optical fibre',points,.018,glass)
            curve('Metalised fibre socket',points[:4],.027,gold)
            pulse=sphere('Photon packet',(0,0,0),.034,amber if i%7==0 else ice,scale=(1,2.8,1))
            def pose(t,o=pulse,path=points,delay=i/26+side*.17):
                u=(t*2+delay)%1; at=u*(len(path)-1);k=int(at);p=Vector(path[k]).lerp(Vector(path[min(k+1,len(path)-1)]),at-k)
                o.location=p;fade=math.sin(math.pi*u)**.5;o.scale=(fade,fade*2,fade)
            keys(pulse,pose,properties=('location','scale'))
    for i in range(10):
        z=.71
        curve('Etched circuit grid',[(-.73+i*.16,-.73,z),(-.73+i*.16,.73,z)],.0027,gold)
        curve('Etched circuit grid',[(-.73,-.73+i*.16,z),(.73,-.73+i*.16,z)],.0027,gold)
    silicon=material('Violet silicon interference',(.095,.10,.19),.86,.18)
    for a in range(6):
        for b in range(6):
            x=-.62+a*.24;y=-.62+b*.24
            box('Silicon compute tile',(x,y,.715),(.19,.19,.014),silicon,.005)
            for k in range(4):
                curve('Lithographic trace',[(x-.075,y-.060+k*.035,.726),(x+.065,y-.060+k*.035,.726)],.0018,gold)
    for x,y in [(-2,-2),(2,-2),(-2,2),(2,2)]:
        cylinder('Titanium mounting screw',(x,y,.42),.11,.06,graphite)
        box('Screwhead slot',(x,y,.454),(.14,.018,.008),gold,.002)
    cam=camera((5.7,-8.2,12.2),(0,0,.8),53)
    area('Cyan reflection card',(-3,3,3),380,(.15,.65,1),3,(0,0,.5))
    return {'subject':'An optical processor','motion':'104 independent photon paths carry signals into the silicon die.'}

def earth():
    s=bpy.context.scene;w=s.world;w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.001,.002,.008,1);w.node_tree.nodes['Background'].inputs[1].default_value=.12
    m=material('NASA Blue Marble',(.1,.3,.6),0,.88)
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Coat Weight'].default_value=0;bs.inputs['Specular IOR Level'].default_value=.08
    n=m.node_tree.nodes;l=m.node_tree.links;tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'public/assets/earth-journey/earth-nasa-july-4096.webp'));l.new(tex.outputs['Color'],n.get('Principled BSDF').inputs['Base Color'])
    globe=sphere('Earth',(0,0,0),2.65,m);globe.rotation_euler.x=.16
    keys(globe,lambda t:setattr(globe.rotation_euler,'z',TAU*t),properties=('rotation_euler',))
    # Thin physically lit cloud geometry with a procedural alpha weather field.
    cloudmat=material('High cloud veil',(.78,.87,.96),rough=.7)
    n=cloudmat.node_tree.nodes;l=cloudmat.node_tree.links
    cloudmap=n.new('ShaderNodeTexImage');cloudmap.image=bpy.data.images.load(str(ROOT/'public/assets/earth-journey/nasa-clouds-2048.jpg'))
    bs=n.get('Principled BSDF');bs.inputs['Coat Weight'].default_value=0;bs.inputs['Specular IOR Level'].default_value=0
    l.new(cloudmap.outputs['Color'],bs.inputs['Alpha']);cloudmat.surface_render_method='BLENDED';cloudmat.use_backface_culling=True
    clouds=sphere('Cloud layer',(0,0,0),2.675,cloudmat);clouds.rotation_euler.x=.16
    keys(clouds,lambda t:setattr(clouds.rotation_euler,'z',TAU*t),properties=('rotation_euler',))
    atmo=bpy.data.materials.new('Blue atmospheric limb');atmo.use_nodes=True;n=atmo.node_tree.nodes;n.clear();l=atmo.node_tree.links
    lw=n.new('ShaderNodeLayerWeight');lw.inputs['Blend'].default_value=.25;power=n.new('ShaderNodeMath');power.operation='POWER';power.inputs[1].default_value=2.4
    l.new(lw.outputs['Fresnel'],power.inputs[0]);transparent=n.new('ShaderNodeBsdfTransparent');emit=n.new('ShaderNodeEmission');emit.inputs[0].default_value=(.10,.38,1,1);emit.inputs[1].default_value=.5
    mix=n.new('ShaderNodeMixShader');out=n.new('ShaderNodeOutputMaterial');l.new(power.outputs[0],mix.inputs[0]);l.new(transparent.outputs[0],mix.inputs[1]);l.new(emit.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],out.inputs[0]);atmo.surface_render_method='BLENDED';atmo.use_backface_culling=True
    sphere('Atmosphere',(0,0,0),2.686,atmo)
    area('Orbital sunrise',(-6,-3,5),4200,(1,.84,.68),3,(0,0,0));area('Blue night fill',(2,-5,-2),100,(.2,.45,1),5)
    stars=material('Starlight',(.5,.67,1),emission=2);rng=random.Random(822)
    for i in range(130):sphere('Distant star',(rng.uniform(-16,16),7,rng.uniform(-7,9)),rng.uniform(.004,.014),stars)
    camera((0,-15.8,3.2),(0,0,0),52)
    return {'subject':'Earth from orbit','motion':'The NASA-mapped globe and its cloud layer turn beneath a warm solar rim.'}

def contact():
    studio(True)
    brass=material('Brushed champagne brass',(.5,.28,.095),.87,.24,texture=.1)
    dark=material('Machined graphite',(.02,.028,.042),.75,.25,texture=.08)
    glass=material('Coated optical glass',(.05,.24,.33),.5,.13,.1)
    lum=material('Light source',(.15,.63,.9),emission=3)
    # Axis points along Y; nested physical lens barrels with machined details.
    for i in range(7):
        y=.35+i*.25;major=1.65-i*.13
        r=ring('Concentric machined lens barrel',(0,y,2.15),major,.095,brass if i%2==0 else dark,(math.pi/2,0,0))
        for j in range(48):
            a=j*TAU/48;o=box('Knurled grip',(major*math.cos(a),y,2.15+major*math.sin(a)),(.032,.13,.055),dark,.009);o.rotation_euler.y=-a
    cylinder('Blue optical element',(0,2,2.15),.8,.08,glass,(math.pi/2,0,0))
    cylinder('Illuminated rear element',(0,2.10,2.15),.53,.03,lum,(math.pi/2,0,0))
    # Ten overlapping curved diaphragm leaves rotate about their own pivots.
    for i in range(10):
        a=i*TAU/10
        verts=[]
        for j in range(17):
            u=j/16;angle=a+u*.9
            verts.extend([(math.cos(angle)*(1.45-u*.78),-.10+i*.009,2.15+math.sin(angle)*(1.45-u*.78)),(math.cos(angle+.32)*(1.45-u*.61),-.10+i*.009,2.15+math.sin(angle+.32)*(1.45-u*.61))])
        faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(16)]
        blade=mesh('Iris diaphragm leaf',verts,faces,brass)
        pivot=Vector((math.cos(a)*1.45,-.1,2.15+math.sin(a)*1.45))
        for v in blade.data.vertices:v.co-=pivot
        blade.location=pivot
        keys(blade,lambda t,o=blade:setattr(o.rotation_euler,'y',.42*(1-math.cos(TAU*t))),properties=('rotation_euler',))
        cylinder('Leaf pivot',(pivot.x,-.20,pivot.z),.07,.10,dark,(math.pi/2,0,0))
    box('Optical bench',(0,.6,.15),(4.3,3.4,.35),dark,.12)
    for x in [-1.2,1.2]:box('Instrument cradle',(x,.6,.67),(.16,2.1,1.0),brass,.045)
    cam=camera((3.4,-9.5,5.1),(0,.5,1.8),60)
    area('Long reflected softbox',(-3,-4,7),1700,(1,.8,.5),2,(0,1,2),7)
    return {'subject':'An optical diaphragm','motion':'Ten overlapping machined iris blades open and close around a live light source.'}

def build(id):return {'ml-process':processor,'world':earth,'contact':contact}[id]()
