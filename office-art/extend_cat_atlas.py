#!/usr/bin/env python3
"""Append source-resolution cat activities without changing existing cell pixels."""
import json
from PIL import Image
from cut_ai_art import SRC, OUT, CATS, FW, FH, extract, cell, pack, source_meta


def main(only=None):
    manifest = json.loads((OUT/'atlas.json').read_text())
    choice = json.loads((SRC.parent/'CHOICE.json').read_text())
    for name in CATS:
        if only and name not in only:
            continue
        hero = manifest['heroes'][name]
        source = choice[f'poses-{name}']
        sheet = Image.open(SRC/source).convert('RGB')
        raw = [extract(sheet,name,i,source) for i in range(4)]
        original = Image.open(OUT/hero['image']).convert('RGBA')
        cells = []
        for key, meta in hero['frames'].items():
            x,y=meta['x'],meta['y']
            cells.append((key, original.crop((x,y,x+FW,y+FH)),
                          {k:v for k,v in meta.items() if k not in ('x','y','w','h')}))
        # Scale activities from upright washing to the base sitting height, so
        # lying/window poses keep the source body size rather than growing tall.
        scale = hero['frames']['work']['silhouette_height']/raw[0][0].height
        for i, (key, (im, box)) in enumerate(zip(('wash','cat_stretch','belly','window'),raw)):
            rendered, meta = cell(im,round(im.height*scale),name)
            cells.append((key,rendered,{**meta,**source_meta(source,box,key,i)}))
        hero['activity_source']=source
        hero['activity_source_size']=list(sheet.size)
        pack(hero,cells)
    manifest['cat_poses']=['sit','walk','lie','sleep','wash','cat_stretch','belly','window']
    (OUT/'atlas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()
