"""One-time original asset authoring. Not called by the build."""
import os,json,subprocess,math,tempfile
ROOT=os.path.abspath('public/assets'); TMP=tempfile.mkdtemp(prefix='facet-')
def run(tool,*args):
 subprocess.run([tool,*map(str,args)],check=True,stdout=subprocess.DEVNULL)
def write(path,data):
 os.makedirs(os.path.dirname(path),exist_ok=True)
 with open(path,'w') as f:json.dump(data,f)
def render(name,ops,w=64,h=64,sheet=False):
 path=f'{ROOT}/gems/{name}.png';os.makedirs(os.path.dirname(path),exist_ok=True)
 log=f'{TMP}/draw.json';write(log,ops)
 run('draw-sheet' if sheet else 'draw','render','--actions',log,'--out',path,'--width',w,'--height',h,'--no-layers','--layer-document',f'{TMP}/layers.json')
def rect(x,y,w,h,c):return dict(op='fill_rect',x=x,y=y,width=w,height=h,color=c)
def line(a,b,c):return dict(op='line',x0=a[0],y0=a[1],x1=b[0],y1=b[1],color=c)
# Original convex silhouettes; rays to an off-center table form the crown facets.
shapes=[[(32,5),(53,18),(53,42),(32,58),(10,42),(10,18)],[(19,9),(43,9),(57,31),(43,54),(19,54),(7,31)],[(32,4),(55,31),(32,59),(8,31)],[(17,8),(47,8),(54,17),(54,47),(47,55),(17,55),(9,47),(9,17)],[(32,5),(55,22),(47,50),(17,50),(9,22)],[(22,5),(42,5),(55,32),(42,58),(22,58),(9,32)],[(32,4),(52,16),(57,36),(42,55),(22,55),(7,36),(12,16)]]
colors=[(242,70,113),(247,150,58),(241,211,81),(86,213,148),(83,214,225),(83,132,243),(181,117,241)]
def inside(x,y,p):
 sign=[]
 for i,a in enumerate(p):
  b=p[(i+1)%len(p)];sign.append((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]))
 return all(t>=0 for t in sign) or all(t<=0 for t in sign)
def shade(rgb,f):return '#'+''.join(f'{max(0,min(255,int(v*f))):02x}' for v in rgb)+'ff'
def gem(k,s,turn=0,broken=-1):
 p=shapes[k];rgb=colors[k];ops=[];cx=29+turn;cy=27
 # Pixel scan spans, two-pixel crown texture intentionally keeps its pixel grid.
 for y in range(4,60):
  for x in range(5,59):
   if not inside(x,y,p):continue
   edge=not all(inside(x+dx,y+dy,p) for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)])
   ang=math.atan2(y-cy,x-cx);sector=int((ang+math.pi)/(2*math.pi)*len(p))%len(p)
   table=inside(x,y,[(cx-11,cy-10),(cx+11,cy-10),(cx+13,cy+10),(cx-10,cy+13)])
   f=[.65,1.08,.86,.53,1.22,.91,1.0,.72][sector] if not table else 1.12+(x+y)%4*.015
   if edge:f=.40 if y>32 else 1.35
   if broken>=0:
    if broken>0 and (abs(x-32)<1+broken or abs(y-32)<1+broken*.6):continue
    dx=(1 if x>=32 else -1)*broken*3;dy=(1 if y>=32 else -1)*broken*2
    xx=x+dx;yy=y+dy
    if xx<0 or xx>63 or yy<0 or yy>63:continue
   else:xx=x;yy=y
   ops.append(rect(xx,yy,1,1,shade(rgb,f)))
 if broken<0:
  # Table's polished edge and specular glint.
  ops += [line((20+turn,17),(39+turn,17),'#ffffff99'),rect(18,16,3,3,'#ffffffff'),rect(21,16,6,1,'#ffffffcc')]
  cracks=[[(37,9),(29,24),(35,31),(25,46)],[(14,28),(29,24),(42,37),(51,39)],[(25,46),(32,54),(35,31),(47,15)]]
  for crack in cracks[:s]:
   for a,b in zip(crack,crack[1:]):ops += [line(a,b,'#10172aff'),line((a[0]+1,a[1]),(b[0]+1,b[1]),'#f9ffffcc' if s==3 else '#c5e5ef88')]
  if s==3:ops += [rect(27,29,6,4,'#fff5dfff'),rect(28,28,3,6,'#fff5dfff')]
 return ops
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst']
for k,n in enumerate(names):
 for s in range(4):render(f'{n}-{s}',gem(k,s))
 for f in range(6):render(f'break/{n}/{f}',gem(k,0,broken=f),sheet=True)
for s in range(4):
 ops=gem(2,s)
 # Alternating refracted colors rather than a kind hue.
 for op in ops:
  if op['op']=='fill_rect' and len(op['color'])==9:
   x=op['x'];y=op['y'];base=colors[(x//8+y//13)%7];op['color']=shade(base,1.1 if y<32 else .85)
 render(f'prism-{s}',ops)
for f in range(8):
 source=gem(2,0)
 pixels={(op['x'],op['y']):op['color'] for op in source if op['op']=='fill_rect'}
 angle=f*math.pi/4
 ops=[]
 for y in range(64):
  for x in range(64):
   dx=x-32;dy=y-32
   sx=round(32+dx*math.cos(angle)+dy*math.sin(angle));sy=round(32-dx*math.sin(angle)+dy*math.cos(angle))
   if (sx,sy) in pixels:
    ops.append(rect(x,y,1,1,shade(colors[(sx//9+sy//13)%7],1.1 if sy<32 else .82)))
 render(f'prism-turn/{f}',ops,sheet=True)
for n in ['brilliant','star']:
 ops=[]
 if n=='brilliant':
  for a,b in zip([(32,7),(56,32),(32,57),(7,32),(32,7)],[(56,32),(32,57),(7,32),(32,7)]):ops.append(line(a,b,'#fff4caff'))
  for x,y in [(32,7),(56,32),(32,57),(7,32)]:ops += [rect(x-2,y-2,5,5,'#fff6dfff')]
 else:
  pts=[]
  for i in range(16):
   a=i*math.pi/8;r=26 if i%2==0 else 9;pts.append((round(32+math.cos(a)*r),round(32+math.sin(a)*r)))
  for i in range(16):ops.append(line(pts[i],pts[(i+1)%16],'#ffefd5ff'))
  ops += [rect(30,25,4,14,'#ffffffff'),rect(25,30,14,4,'#ffffffff')]
 render(n,ops)
# Engraved brass bench, produced at the board's full logical size.
ops=[rect(0,0,608,608,'#27332fff'),rect(3,3,602,602,'#b0965aff'),rect(5,5,598,598,'#3b4540ff'),rect(11,11,586,586,'#111e23ff')]
for y in range(8):
 for x in range(8):
  xx=16+x*72;yy=16+y*72
  ops += [rect(xx,yy,72,72,'#1d2c30ff' if (x+y)%2==0 else '#19282dff'),rect(xx+3,yy+3,66,1,'#3d4b47ff'),rect(xx+3,yy+4,1,65,'#344540ff'),rect(xx+5,yy+68,63,1,'#0c1b21ff')]
for x,y in [(8,8),(598,8),(8,598),(598,598)]:ops += [rect(x-2,y-2,5,5,'#debd78ff'),rect(x,y,1,1,'#44372aff')]
render('board-frame',ops,608,608)
# Real authored particle systems.
for n,count,speed,size,color in [('clear',14,65,2.4,'#a6eaff'),('flawed',28,105,4,'#ffbd7c'),('cut',22,75,3.5,'#fff1b9'),('aura',0,9,1.9,'#ffe9ad')]:
 d=f'{ROOT}/fx/{n}';os.makedirs(d,exist_ok=True);cfg=f'{TMP}/{n}.json'
 write(cfg,dict(width=128,height=128,duration_ms=1200,fps=30,seed=81,actions=f'{TMP}/{n}-log.json',preview=f'{TMP}/{n}.gif',system=f'{d}/system.json'))
 run('particle-2d','--config',cfg,'init')
 run('particle-2d','--config',cfg,'add-emitter','--name','spark','--shape','disc','--radius',23 if n=='aura' else 3,'--x',0,'--y',0,'--lifetime',700,'--speed',speed,'--cone-angle',180,*(['--rate',8] if n=='aura' else ['--burst',count]))
 run('particle-2d','--config',cfg,'set-particle','--emitter','spark','--size-from',size,'--size-to',0,'--opacity-from',.85,'--opacity-to',0,'--color-gradient',f'{color}@0,#ffffff@0.2,{color}@1')
 if n=='aura':run('particle-2d','--config',cfg,'set-timeline','--loop','true')
 run('particle-2d','--config',cfg,'render','--frame',5,'--out',f'{TMP}/{n}-preview.png')
# Sculpted short synth cues and ascending glass ladder.
def audio_cfg(n,dur=1000,tool='sfx-synth'):
 cfg=f'{TMP}/audio-{n}.json';write(cfg,dict(sample_rate=44100,channels='stereo',max_duration_ms=dur,seed=123,sample_pack='combat-core',instrument_bank='gm-lite',actions=f'{TMP}/audio-{n}-log.json',preview=f'{TMP}/{n}.png',wav=f'{ROOT}/audio/{n}.wav',mid=f'{ROOT}/audio/{n}.mid'))
 run(tool,'--config',cfg,'init');return cfg
os.makedirs(f'{ROOT}/audio',exist_ok=True)
for n,freq,end,dur in [('select',900,1200,65),('swap',480,960,140),('refuse',150,90,160),('land',95,48,190),('flaw',1200,180,130),('cut',1600,2200,300),('levelup',523,1046,700),('gameover',440,110,750)]+[(f'ladder-{i}',523*2**((i-1)/12),523*2**((i-1)/12),280) for i in range(1,9)]:
 cfg=audio_cfg(n)
 run('sfx-synth','--config',cfg,'add-voice','--name','tone','--wave','triangle','--freq',freq,'--dur',dur,'--gain',-15)
 run('sfx-synth','--config',cfg,'set-envelope','--voice','tone','--env','pluck')
 run('sfx-synth','--config',cfg,'set-pitch','--voice','tone','--slide-to',end,'--over',dur)
 run('sfx-synth','--config',cfg,'add-voice','--name','glass','--wave','sine','--freq',freq*2.76,'--dur',dur*.6,'--gain',-25)
 run('sfx-synth','--config',cfg,'set-envelope','--voice','glass','--env','pluck')
 run('sfx-synth','--config',cfg,'render')
cfg=audio_cfg('shatter',1000,'sfx-sample')
run('sfx-sample','--config',cfg,'add-sample','--name','debris_glass','--t',0,'--gain',-18,'--trim','0,500','--fade-out',170)
run('sfx-sample','--config',cfg,'render')
# Layer the sampled body under each ladder into one file-backed clear source.
import wave,array
for i in range(1,9):
 with wave.open(f'{ROOT}/audio/ladder-{i}.wav','rb') as w:params=w.getparams();a=array.array('h',w.readframes(w.getnframes()))
 with wave.open(f'{ROOT}/audio/shatter.wav','rb') as w:b=array.array('h',w.readframes(w.getnframes()))
 c=array.array('h',[max(-32768,min(32767,(a[j] if j<len(a) else 0)+(b[j] if j<len(b) else 0))) for j in range(max(len(a),len(b)))])
 with wave.open(f'{ROOT}/audio/clear-{i}.wav','wb') as w:w.setparams(params);w.writeframes(c.tobytes())
for n,tempo in [('title',100),('play',72)]:
 cfg=audio_cfg(n,27000,'music');run('music','--config',cfg,'set-tempo','--bpm',tempo)
 for track,inst,gain in [('hook','music_box',-18),('bed','vibraphone',-23),('bass','marimba',-24)]:
  run('music','--config',cfg,'define-track','--name',track,'--instrument',inst)
  run('music','--config',cfg,'set-track-fx','--track',track,'--gain',gain,'--reverb',.18)
 melody=[76,79,83,81,79,74,76,71,72,76,79,78,76,71,74,67]
 for i,pitch in enumerate(melody*2):
  run('music','--config',cfg,'add-note','--track','hook','--pitch',pitch,'--t',i,'--dur',.65 if n=='title' else .9,'--velocity',74 if n=='title' else 45)
 for bar,root in enumerate([52,48,55,50]*2):
  for p in [root+12,root+19,root+24]:run('music','--config',cfg,'add-note','--track','bed','--pitch',p,'--t',bar*4,'--dur',3.5,'--velocity',55)
  for beat in [0,2]:run('music','--config',cfg,'add-note','--track','bass','--pitch',root,'--t',bar*4+beat,'--dur',1.8,'--velocity',60)
 run('music','--config',cfg,'render')
print('Produced original Facet asset collection.')
