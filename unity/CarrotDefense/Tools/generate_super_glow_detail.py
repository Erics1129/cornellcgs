"""Tileable procedural value-noise detail map for the SuperGlow surface (no image generator involved).
Writes Assets/Resources/Carrot/Models/Materials/SuperGlowDetail.png: 256 px, deterministic seed, seamless wrap."""
import zlib,struct,math,random,os
from pathlib import Path
ROOT=Path(os.environ.get('CARROT_UNITY_ROOT') or Path(__file__).resolve().parents[1])
OUT=ROOT/'Assets/Resources/Carrot/Models/Materials/SuperGlowDetail.png'
N=256;rng=random.Random(5150)
def lattice(size):return [[rng.random() for _ in range(size)] for _ in range(size)]
def sample(grid,size,x,y):
 gx=x*size/N;gy=y*size/N;x0=int(gx)%size;y0=int(gy)%size;x1=(x0+1)%size;y1=(y0+1)%size;fx=gx-int(gx);fy=gy-int(gy)
 sx=fx*fx*(3-2*fx);sy=fy*fy*(3-2*fy)
 a=grid[y0][x0]+(grid[y0][x1]-grid[y0][x0])*sx;b=grid[y1][x0]+(grid[y1][x1]-grid[y1][x0])*sx
 return a+(b-a)*sy
octaves=[(lattice(8),8,.55),(lattice(16),16,.28),(lattice(32),32,.12),(lattice(64),64,.05)]
rows=[]
for y in range(N):
 row=bytearray()
 for x in range(N):
  v=sum(sample(g,s,x,y)*w for g,s,w in octaves)
  # Filigree: thin bright veins where the noise crosses mid-grey, over a warm soft base.
  vein=max(0,1-abs(v-.5)*9)**2
  base=.70+.26*v;value=min(1,base+.30*vein)
  r=value;g=value*(.96-.05*vein);b=value*(.86-.12*vein)
  row+=bytes((int(r*255),int(g*255),int(b*255)))
 rows.append(row)
raw=b''.join(b'\x00'+bytes(r) for r in rows)
def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
OUT.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',N,N,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
print('SUPER_GLOW_DETAIL',OUT,OUT.stat().st_size,'bytes')
