#!/usr/bin/env python3
"""Deterministic pixel-art heroes and review proofs. Requires Pillow.

Run from any directory: python3 office-art/draw_heroes.py
All frame coordinates and anchors are in source pixels; nearest-neighbour scaling only.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = Path('/home/q/work/office-bridge/output')
W,H=64,96
INK='#202733'; PAPER='#f1e8cf'; SKIN='#e8b58e'; WHITE='#f5eee0'; SCREEN='#1a303c'
# Names, role, skin, hair, hair highlight, garment, light, trousers, accent, kind, prop
HEROES=[
('Ярик','Архитектор','#e8b58e','#30221f','#614234','#214b40','#508573','#495b6a','#172b49','curls','glasses'),
('Лёха','Разработчик','#dca079','#41302c','#755142','#545180','#8c89b6','#29384e','#7ce3a1','phones','laptop'),
('Ася','Код-ревью · QA','#f0c4a4','#683d2c','#a06843','#94535d','#c98788','#3f3d55','#f16d69','pony','checklist'),
('Иваныч','Нормоконтроль','#dcb394','#a7b0b0','#e2dfcd','#77784e','#b6b585','#4b5152','#e5bd66','cap','book'),
('Тая','Визуал','#eec09c','#a14e30','#db8652','#306b79','#69aab1','#414967','#f2799a','beret','art'),
('Саня','Тестировщик','#d6a17e','#8b673a','#c29859','#3d7881','#76b6b4','#34434b','#f0c45f','helmet','phone'),
('Мотя','Воркер','#738d9a','#304655','#b3cbd0','#4c6575','#839eac','#293a48','#6ad9d0','server','server'),
('whoami','Безопасник','#c69678','#777d80','#c5c9c3','#29323e','#65727f','#263342','#9ab8b2','security','terminal'),
('Люда','Диспетчер JH','#e9b999','#3f2b3f','#77516c','#a57947','#d7b47c','#45415b','#7bd5d5','bun','charts'),
('Шарик','Поиск и отклики','#c68d52','#66422d','#e0b77d','#637348','#a5ad7a','#885d3c','#e5bd66','dog','cv')]
FRAMES=['work_type','work_read','walk_1','walk_2','walk_3','walk_4','stretch_1','stretch_2','cooler_1','cooler_2','easter_1','easter_2']
EASTERS=['llama / sunglasses','duck / works on my machine','LGTM / cactus','thermos / indicator','cat / paint','bug in jar','regression LED','sudo / lock','headphones on cactus','CV / tail']
def rect(d,xy,c): d.rectangle(xy,fill=c)
def box(d,xy,c,edge=INK):
 x,y,x2,y2=xy; rect(d,xy,edge); rect(d,(x+1,y+1,x2-1,y2-1),c)
def line(d,xy,c,w=1): d.line(xy,fill=c,width=w)
def texttiny(d,xy,s,c=INK): d.text(xy,s,font=ImageFont.load_default(),fill=c,stroke_width=0)
def prop(d,kind,x=47,y=49):
 if kind=='glasses':
  # Sunglasses in the right hand, deliberately separated from the shirt.
  rect(d,(x,y+3,x+6,y+8),INK); rect(d,(x+8,y+3,x+14,y+8),INK); line(d,[(x+6,y+5),(x+8,y+5)],INK); line(d,[(x+1,y+4),(x+5,y+4)],'#9cc9ca'); line(d,[(x+9,y+4),(x+13,y+4)],'#9cc9ca')
 elif kind=='checklist':
  box(d,(x,y-3,x+12,y+18),PAPER); rect(d,(x+3,y-4,x+9,y-2),'#879a95')
  for yy in (y+1,y+6,y+11): rect(d,(x+2,yy,x+4,yy+2),'#4d9984'); line(d,[(x+6,yy+1),(x+10,yy+1)],'#84938c')
  rect(d,(x+14,y-4,x+15,y+16),'#ef5960'); rect(d,(x+14,y+17,x+15,y+18),WHITE)
 elif kind=='book':
  box(d,(x,y-3,x+14,y+18),'#95533b'); rect(d,(x+2,y-1,x+12,y+12),'#bf7855'); texttiny(d,(x+2,y+1),'PU',PAPER); rect(d,(x+2,y+15,x+12,y+17),PAPER)
 elif kind in ('art','laptop','terminal','charts'):
  box(d,(x,y,x+15,y+13),'#7c9195'); rect(d,(x+2,y+2,x+13,y+10),SCREEN)
  if kind=='art':
   rect(d,(x+3,y+3,x+7,y+6),'#ed799c'); rect(d,(x+8,y+5,x+12,y+9),'#6ac9b9'); rect(d,(x+4,y+8,x+6,y+9),'#eac16d'); rect(d,(x+16,y-7,x+17,y+3),WHITE)
  elif kind=='charts':
   for i,h in enumerate((4,7,9)): rect(d,(x+3+i*4,y+10-h,x+5+i*4,y+9),['#efc874','#73cbbb','#e8d69e'][i])
  else:
   for i in range(3): rect(d,(x+3,y+3+i*2,x+9+i%2*3,y+3+i*2),'#76d1a7')
   if kind=='terminal': rect(d,(x+11,y+7,x+12,y+9),'#ed6c67')
 elif kind=='phone':
  box(d,(x+2,y-6,x+13,y+18),'#678d91'); rect(d,(x+4,y-3,x+11,y+12),'#a6e0db'); rect(d,(x+5,y-2,x+10,y),'#e7f3df'); rect(d,(x+7,y+15,x+8,y+16),INK)
 elif kind=='cv':
  box(d,(x,y-3,x+14,y+18),PAPER); texttiny(d,(x+2,y+1),'CV'); line(d,[(x+3,y+11),(x+11,y+11)],'#9aa395')

def hero(c,frame,idx):
 name,role,skin,hair,hl,shirt,light,pants,accent,kind,tool=c
 im=Image.new('RGBA',(W,H)); d=ImageDraw.Draw(im)
 walk=frame.startswith('walk'); stretch=frame.startswith('stretch'); cool=frame.startswith('cooler'); easter=frame.startswith('easter'); phase=FRAMES.index(frame)
 if kind=='server':
  # mobile rack: flashing LED and extendable arms, all on the same foot line
  rect(d,(12,91,51,93),'#1a2731'); box(d,(15,9,48,87),'#7995a2'); rect(d,(18,12,45,83),'#263f4d'); rect(d,(19,13,44,15),'#b0c5c3')
  for yy in (20,33,46,59,72):
   box(d,(19,yy,44,yy+10),'#425e6b'); rect(d,(22,yy+3,37,yy+4),'#76919a'); rect(d,(40,yy+3,42,yy+5), '#f06d64' if easter and phase%2 else accent)
  shift = ([-3,-1,3,1][phase-2] if walk else 0)
  rect(d,(21+shift,87,27+shift,92),INK); rect(d,(37-shift,87,43-shift,92),INK)
  for x in (7,49):
   y=(5 if frame=='stretch_2' else 11) if stretch else (46 if frame in ('work_read','walk_2','walk_4') else 49); rect(d,(x,y,x+5,y+12),'#9db8bd'); rect(d,(x+1,y+1,x+3,y+10),'#54707c')
  if easter: rect(d,(23,17,25,18),'#f06d64' if frame=='easter_1' else '#e6c56d')
  if cool: box(d,(49,40 if frame=='cooler_2' else 48,59,50 if frame=='cooler_2' else 58),'#c5e1df')
  return im
 # legs: asymmetrical strides, phase changes actual silhouettes
 if walk:
  offsets=[(-7,6),(-3,3),(6,-7),(3,-3)][phase-2]
 else: offsets=(-1,1)
 for j,off in enumerate(offsets):
  x=20+j*13+off; top=71; bottom=90-(3 if walk and j==(phase%2) else 0)
  box(d,(x,top,x+11,bottom),pants); rect(d,(x+2,top+2,x+3,bottom-3),light); rect(d,(x-1,bottom-2,x+12,bottom+2),INK); rect(d,(x+1,bottom-2,x+10,bottom-2),'#73818a')
 # arms behind body; right-hand prop remains right in every pose
 if stretch:
  for x in (9,46):
   sy = 28 if frame=='stretch_2' else 33
   box(d,(x,sy,x+8,54),shirt); rect(d,(x+2,sy+1,x+3,48),light); box(d,(x,sy-9,x+8,sy+2),skin)
 else:
  for x in (9,46):
   box(d,(x,43,x+8,66),shirt); rect(d,(x+2,45,x+3,58),light); box(d,(x,61,x+8,70),skin)
 # torso with folds, rim lighting and material shades
 box(d,(17,40,46,74),shirt); rect(d,(18,42,19,70),light); rect(d,(43,43,44,72),'#24333c'); rect(d,(22,48,23,65),light); rect(d,(24,67,32,68),light); rect(d,(35,70,41,71),INK)
 if kind=='curls':
  for y in (48,60): rect(d,(19,y,44,y+5),accent); rect(d,(19,y,44,y),PAPER)
  line(d,[(39,41),(22,65)],'#4a3832',3); box(d,(13,63,23,75),'#594842')
 elif kind in ('phones','security'):
  line(d,[(22,42),(27,46),(36,46),(41,42)],light,2); rect(d,(25,48,26,59),PAPER); rect(d,(37,48,38,59),PAPER); line(d,[(24,66),(40,66)],light)
 elif kind in ('cap','dog'):
  rect(d,(29,41,34,72),PAPER); line(d,[(31,43),(31,70)],'#6c7266'); box(d,(20,58,27,67),light); box(d,(37,58,44,67),light)
 elif kind=='beret':
  rect(d,(22,41,41,47),accent); rect(d,(36,45,41,62),accent); rect(d,(37,58,40,59),'#eac16d')
 elif kind=='helmet':
  box(d,(24,51,39,63),PAPER); texttiny(d,(25,53),'QA'); rect(d,(20,43,22,52),light); rect(d,(41,43,43,52),light)
 else:
  rect(d,(29,42,34,71),light); box(d,(21,61,27,68),PAPER)
 # head and neck
 if kind=='pony': box(d,(43,14,51,36),hair); rect(d,(47,18,49,30),hl); rect(d,(44,16,50,18),accent)
 if kind=='bun': box(d,(24,1,36,10),hair); rect(d,(26,2,34,3),hl)
 if kind=='dog':
  box(d,(16,8,47,38),skin); box(d,(13,9,20,32),hair); box(d,(44,9,51,32),hair); rect(d,(20,10,22,24),hl); rect(d,(42,10,43,25),hl); rect(d,(25,21,27,23),INK); rect(d,(37,21,39,23),INK); box(d,(25,27,39,35),'#e1bb88'); rect(d,(30,27,34,29),INK); line(d,[(32,30),(32,33),(29,34)],INK)
 else:
  box(d,(20,10,43,37),skin); rect(d,(21,16,22,28),'#f4cba7'); rect(d,(40,19,41,33),'#bf876c'); rect(d,(24,12,39,13),hl)
  rect(d,(20,8,43,15),hair); rect(d,(20,13,23,20),hair); rect(d,(40,13,43,20),hair); rect(d,(23,9,38,10),hl)
  if kind=='curls':
   for x,y in ((19,8),(23,4),(29,6),(35,4),(40,8)): box(d,(x,y,x+6,y+6),hair); rect(d,(x+1,y+1,x+3,y+1),hl)
  rect(d,(24,19,28,20),hair); rect(d,(35,19,39,20),hair); rect(d,(25,22,27,24),INK); rect(d,(36,22,38,24),INK); rect(d,(31,24,33,28),'#bd806b'); line(d,[(28,32),(35,32)],'#975d56')
  if kind in ('pony','cap','security'):
   yy=23 if kind=='cap' else 20
   for x in (23,34): box(d,(x,yy,x+8,yy+6),'#c4d9cf'); rect(d,(x+3,yy+3,x+4,yy+4),INK)
   rect(d,(32,yy+2,33,yy+2),INK)
  if kind=='cap':
   box(d,(21,4,42,10),'#707666'); rect(d,(17,9,46,11),INK); rect(d,(19,9,44,9),'#c3c0a4'); rect(d,(24,30,30,33),hl); rect(d,(34,30,40,33),hl); rect(d,(29,31,35,32),hl)
  elif kind=='beret': box(d,(18,5,45,12),accent); rect(d,(22,6,38,7),'#ffb0c3'); rect(d,(35,2,37,5),accent)
  elif kind=='helmet': box(d,(20,4,43,13),accent); rect(d,(16,11,47,14),INK); rect(d,(17,11,46,12),accent); rect(d,(30,5,33,11),'#ffe6a0')
  elif kind=='phones':
   line(d,[(19,12),(19,5),(44,5),(44,12)],INK,3)
   for x in (17,42): box(d,(x,12,x+6,25),shirt); rect(d,(x+2,14,x+4,22),accent)
  elif kind=='security': rect(d,(24,30,39,35),hl); rect(d,(28,31,35,32),hair); rect(d,(27,35,36,37),hair)
  elif kind=='bun':
   line(d,[(19,21),(19,10),(25,7)],accent,2); box(d,(17,18,22,27),accent); line(d,[(19,26),(19,30),(28,30)],INK,2); rect(d,(27,29,30,31),accent)
 # right hand and item; stretch reaches overhead without moving accessory to other hand
 px,py=(46,12 if frame=='stretch_2' else 19) if stretch else (46,47 if frame=='work_read' else 51)
 if tool=='glasses' and px+14>63: px=48
 # The art brush reaches px+17; keep its complete two-pixel tip inside the cell.
 if tool=='art': px=44
 prop(d,tool,px,py)
 if frame.startswith('work'):
  # Free hand alternates between keyboard and a raised reading gesture.
  if frame=='work_type':
   box(d,(3,67,17,71),skin); rect(d,(2,72,17,73),INK)
  else:
   box(d,(8,54,16,63),skin); line(d,[(10,54),(16,51)],light,2)
 if cool:
  box(d,(2,51 if frame.endswith('1') else 45,12,63 if frame.endswith('1') else 57),'#b6d9d7'); rect(d,(4,53 if frame.endswith('1') else 47,10,54 if frame.endswith('1') else 48),WHITE)
 if easter:
  if frame=='easter_2': rect(d,(2,68,4,70),accent)
  # Distinct per-hero tiny companion, kept inside the fixed canvas.
  if kind=='dog': line(d,[(17,67),(9,65),(5,59),(5,53)],skin,3)
  elif kind=='cap': box(d,(2,70,10,90),'#8bb4b5'); rect(d,(4,73,8,85),'#d7e8dc')
  elif kind=='helmet': box(d,(2,73,12,88),'#c3e2d7'); rect(d,(6,78,8,83),'#a04e4e')
  elif kind=='beret': rect(d,(1,83,12,90),INK); rect(d,(2,79,5,84),INK); rect(d,(8,79,11,84),INK); rect(d,(3,85,4,86),accent); rect(d,(9,85,10,86),accent)
  elif kind=='pony': box(d,(2,75,12,89),'#86a876'); rect(d,(5,71,8,80),'#6ec68f'); rect(d,(8,73,10,78),'#6ec68f')
  elif kind=='phones': rect(d,(1,84,13,89),'#f4cf68'); rect(d,(8,80,14,85),'#f4cf68'); rect(d,(12,81,13,82),INK)
  elif kind=='curls': rect(d,(2,76,12,89),PAPER); rect(d,(8,71,12,80),PAPER); rect(d,(10,73,11,74),INK)
  elif kind=='security': box(d,(2,78,14,89),PAPER); texttiny(d,(3,79),'sudo')
  elif kind=='bun': box(d,(2,78,13,89),'#b17b55'); rect(d,(6,71,9,81),'#6ac496'); rect(d,(3,74,5,79),'#6ac496'); rect(d,(4,74,5,77),accent)
 return im

def build():
 out=ROOT/'public/heroes'; out.mkdir(parents=True,exist_ok=True); OUT.mkdir(parents=True,exist_ok=True)
 atlas={'version':1,'frame_size':{'w':W,'h':H},'origin':'top-left','coordinate_units':'source pixels','image_sampling':'nearest','animations':{'work':['work_type','work_read'],'walk':['walk_1','walk_2','walk_3','walk_4'],'stretch':['stretch_1','stretch_2'],'cooler':['cooler_1','cooler_2'],'easter':['easter_1','easter_2']},'heroes':{}}
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12); bold=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',14)
 preview=Image.new('RGB',(1150,85+len(HEROES)*204),'#192832'); p=ImageDraw.Draw(preview)
 p.text((15,10),'OFFICE-7A  /  ГЕРОИ 64 × 96',font=bold,fill=PAPER); p.text((15,36),'Работа ×2  ·  шаг ×4  ·  потягивание ×2  ·  кулер ×2  ·  пасхалки ×2    |    1× и 2×',font=font,fill='#9ab5bb')
 for i,c in enumerate(HEROES):
  name=c[0]; sheet=Image.new('RGBA',(W*len(FRAMES),H)); frames={}
  for j,f in enumerate(FRAMES):
   sprite=hero(c,f,i); sheet.alpha_composite(sprite,(j*W,0)); frames[f]={'x':j*W,'y':0,'w':W,'h':H,'foot_anchor':[32,93],'label_anchor':[32,0]}
  sheet.save(out/(name+'.png'))
  atlas['heroes'][name]={'image':name+'.png','role':c[1],'easter_egg':EASTERS[i],'frames':frames}
  y=70+i*204; p.rectangle((0,y-3,1149,y+199),fill='#263841' if i%2==0 else '#30414a'); p.text((14,y+8),name,font=bold,fill=PAPER); p.text((14,y+30),c[1],font=font,fill='#a6bbc0')
  for j in range(12): preview.paste(sheet.crop((j*W,0,(j+1)*W,H)),(165+j*64,y),sheet.crop((j*W,0,(j+1)*W,H)))
  sprite=hero(c,'work_type',i); big=sprite.resize((128,192),Image.Resampling.NEAREST); preview.paste(big,(990,y),big)
  p.text((945,y+5),'2×',font=font,fill='#a6bbc0')
 preview.save(OUT/'heroes-sheet-v2.png')
 (out/'atlas.json').write_text(json.dumps(atlas,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 layout=json.loads((ROOT/'office-art/layout.json').read_text()); office=Image.open(ROOT/'public/office-bg-loft.png').convert('RGBA')
 for k in ('panel','rack_lights','llama'):
  o=layout['live_objects'][k]; path=o.get('image') or (o['variants']['green'] if k=='panel' else o['frames'][0]); office.alpha_composite(Image.open(ROOT/'public'/path.lstrip('/')).convert('RGBA'),(o['x'],o['y']))
 for i,c in enumerate(HEROES):
  pos=layout['heroes'][c[0]]; sprite=hero(c,'work_type',i); # 64×96 at 0.9 equals old 40×60 at 0.9, scaled 1.6
  sprite=sprite.resize((round(W*.9),round(H*.9)),Image.Resampling.NEAREST); x=round(pos['x']-32*.9); y=round(pos['y']-18-93*.9); office.alpha_composite(sprite,(x,y))
 office.convert('RGB').save(OUT/'heroes-in-office-v2.png')
if __name__=='__main__': build()
