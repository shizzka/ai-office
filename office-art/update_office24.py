#!/usr/bin/env python3
"""Slice owner's supplied OFFICE-24 art. Keep complete poses, including detached cap.
No painting, rotation, silhouette trimming or source changes; only chroma key and scale.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy import ndimage
from cut_ai_art import chroma_mask, components
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/heroes-ai'; SRC=ROOT/'office-art/office24'
m=json.loads((OUT/'atlas.json').read_text()); h=m['heroes']['owner']; frames=h['frames']
atlas=Image.open(OUT/h['image']).convert('RGBA').crop((0,0,3456,3600))

def cut(filename,left,right):
    im=Image.open(SRC/filename).convert('RGB'); a=np.array(im).astype(np.int16)
    mask=chroma_mask(im,'owner','night')
    if filename=='owner-mattress.png':
        labels,found=components(mask,50000)
        major=sorted(found,key=lambda c:c[1][0])
        selected=[0,550,1080,1455].index(left)
        # Diagonal poses overlap in X. Separate their connected silhouettes,
        # never cut the first mattress at a vertical quarter boundary.
        groups=[]
        objects=ndimage.find_objects(labels)
        for ident,box in enumerate(objects,1):
            if box is None:continue
            matching=next((i for i,c in enumerate(major) if c[2]==ident),None)
            if matching is None:
                cy=(box[0].start+box[0].stop)/2;cx=(box[1].start+box[1].stop)/2
                matching=min(range(4),key=lambda i:(cx-(major[i][1][0]+major[i][1][2])/2)**2+(cy-(major[i][1][1]+major[i][1][3])/2)**2)
            if matching==selected:groups.append(ident)
        mask=np.isin(labels,groups);left=0;right=im.width

    edge=mask&(ndimage.distance_transform_edt(np.pad(mask,1))[1:-1,1:-1]<=3)
    spill=np.where(edge,np.maximum(0,np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1]-38),0)
    a[:,:,0]-=spill;a[:,:,2]-=spill
    a=np.dstack([np.clip(a,0,255).astype(np.uint8),mask.astype(np.uint8)*255])
    im=Image.fromarray(a).crop((left,0,right,im.height)); b=im.getbbox()
    return im.crop(b),(b[0]+left,b[1],b[2]+left,b[3])

for i,(left,right) in enumerate([(0,475),(475,943),(943,1458),(1458,1916)]):
    key=['owner_sleep_forward','owner_sleep_back','owner_wake','owner_yawn'][i]
    raw,b=cut('owner-night.png',left,right)
    # Constant chair-wheel scale across all four poses: cap flight is not scaled away.
    scale=396/(739-210)
    raw=raw.resize((round(raw.width*scale),round(raw.height*scale)),Image.Resampling.LANCZOS)
    row=3000;col=(i+1)*576
    new=Image.new('RGBA',(atlas.width,max(atlas.height,row+600)));new.paste(atlas,(0,0));atlas=new
    cell=Image.new('RGBA',(576,600));cell.alpha_composite(raw,(288-raw.width//2,576-raw.height))
    atlas.paste(cell,(col,row))
    frames[key]=dict(x=col,y=row,w=576,h=600,foot=[288,576],head=[288, max(0,576-raw.height)],label_anchor=[288,max(0,552-raw.height)],silhouette_height=raw.height,source='office24/owner-night.png',source_bounds=list(b),source_pose=key,source_index=i)

atlas.save(OUT/h['image'],optimize=True)
# Mattress is its own scene prop: its full image rectangle must fit the measured floor.
props={}
for key,left,right in [('back',0,550),('side',550,1080),('rolled',1080,1455),('carry',1455,1916)]:
    raw,b=cut('owner-mattress.png',left,right)
    filename=f'owner-mattress-{key}.png';raw.save(OUT/filename,optimize=True)
    props[key]=dict(image=filename,width=raw.width,height=raw.height,source='office24/owner-mattress.png',source_bounds=list(b))
m['owner_night_props']=props
(OUT/'atlas.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
print('OFFICE-24: complete night poses and mattress props packed')
