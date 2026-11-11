#!/usr/bin/env python3
"""Append OFFICE-23b back pose; preserve every existing atlas cell. No service/API calls."""
from pathlib import Path
import json
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'public/heroes-ai'
m=json.loads((out/'atlas.json').read_text())
h=m['heroes']['owner'];frames=h['frames']
old=Image.open(out/h['image']).convert('RGBA')
raw=Image.open(ROOT/'office-art/office23b/owner-point-back-source.png').convert('RGBA')
bounds=raw.getchannel('A').getbbox();raw=raw.crop(bounds)
# Raised marker extends above the cap; match cap-to-shoe height of original owner.
scale=frames['work']['silhouette_height']/(bounds[3]-220)
raw=raw.resize((round(raw.width*scale),round(raw.height*scale)),Image.Resampling.LANCZOS)
key='owner_point_back';row=frames[key]['y'] if key in frames else old.height
atlas=Image.new('RGBA',(old.width,max(old.height,row+600)));atlas.paste(old,(0,0))
cell=Image.new('RGBA',(576,600));foot_x=round((600-bounds[0])*scale)
opaque_bottom=raw.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()[3]
cell.alpha_composite(raw,(288-foot_x,576-opaque_bottom))
atlas.paste(cell,(0,row));atlas.save(out/h['image'],optimize=True)
head_y=round(576-(bounds[3]-220)*scale)
frames[key]=dict(x=0,y=row,w=576,h=600,foot=[288,576],head=[288,head_y],label_anchor=[288,max(0,head_y-24)],silhouette_height=raw.height,source='office23b/owner-point-back-source.png',source_pose=key,source_bounds=list(bounds))
(out/'atlas.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
print('Appended owner_point_back; all previous cells retained.')
