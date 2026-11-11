#!/usr/bin/env python3
"""Make placement proof from the supplied hero sheet; silhouettes are approximate."""
from pathlib import Path
import json
from PIL import Image
R=Path(__file__).resolve().parent.parent
layout=json.loads((R/'office-art/layout.json').read_text())
im=Image.open(R/'public/office-bg-loft.png').convert('RGBA')
for k in ('panel','rack_lights','llama'):
    o=layout['live_objects'][k]; name= o.get('image') or (o['variants']['green'] if k=='panel' else o['frames'][0])
    im.alpha_composite(Image.open(R/'public'/name.lstrip('/')).convert('RGBA'),(o['x'],o['y']))
# Use the actual sheet's individual walking poses as silhouette references.
sheet=Image.open('/home/q/work/office-bridge/output/heroes-sheet.png').convert('RGB')
names=list(layout['heroes'])
for i,name in enumerate(names):
    # Samples from the same pose column; background consists of two solid stripe colours.
    top=(161+i*148.4)*1.2
    crop=sheet.crop((int(397*1.2),int(top+30*1.2),int(493*1.2),int(top+139*1.2)))
    bg={sheet.getpixel((int(400*1.2),int(top+10*1.2))),sheet.getpixel((int(480*1.2),int(top+10*1.2)))}
    pix=crop.load(); rgba=Image.new('RGBA',crop.size); out=rgba.load()
    for y in range(crop.height):
        for x in range(crop.width):
            c=pix[x,y]
            if c not in bg and all(max(abs(c[j]-b[j]) for j in range(3))>8 for b in bg):
                out[x,y]=(29,40,44,210)
    bounds=rgba.getbbox()
    if bounds:
        rgba=rgba.crop(bounds); rgba=rgba.resize((max(1,round(rgba.width*.48)),max(1,round(rgba.height*.48))),Image.Resampling.NEAREST)
        p=layout['heroes'][name]; im.alpha_composite(rgba,(p['x']-rgba.width//2,p['y']-18-rgba.height))
im.convert('RGB').save(R/'output/office6a-preview.png')
