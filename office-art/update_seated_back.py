#!/usr/bin/env python3
"""OFFICE-19: append selected seated originals; retain every previous cell verbatim."""
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw
from cut_ai_art import SRC, OUT, QA, FW, FH, PIXEL_RATIO, chroma_mask, components, rgba_component, cell, source_meta

KEYS = ('seated_back_type_1', 'seated_back_type_2', 'seated_back_think', 'seated_back_recline')
# Reviewed crown-to-shoulder proportions against each original standing work pose.
# Long hair/bun needs extra silhouette height; all four poses use ONE source scale.
HEIGHT = {'whoami': 66, 'marina': 70, 'owner': 66, 'ivanych': 64, 'taya': 64, 'asya': 70, 'leha': 64, 'yarik': 64}

def main(only=None):
    manifest = json.loads((OUT/'atlas.json').read_text())
    choices = json.loads((SRC.parent/'CHOICE.json').read_text())['seated_back']
    review = {}; board = Image.new('RGB', (5*288, len(choices)*320), '#51483f')
    for row, (identity, filename) in enumerate(choices.items()):
        name = 'mikhalych' if identity == 'whoami' else identity
        if only and name not in only: continue
        hero = manifest['heroes'][name]
        rgb = Image.open(SRC/filename).convert('RGB')
        mask=chroma_mask(rgb, name, 'seated_back')
        _, original_components=components(mask,10000)
        original_components.sort(key=lambda c:c[1][0])
        # Small enclosed gaps between wrists/armrests contain keyed background
        # too. Keep Taya's painted pink beret/scarf; key only near-equal R/B.
        a=np.asarray(rgb).astype(np.int16); red,green,blue=a[:,:,0],a[:,:,1],a[:,:,2]
        holes=(np.minimum(red,blue)>145)&(green<130)&(abs(red-blue)<60)&(np.minimum(red,blue)-green>95)
        if name=='taya': holes &= np.indices(mask.shape)[0]>330
        mask &= ~holes
        labels, found = components(mask, 10000)
        found.sort(key=lambda c:c[1][0])
        assert len(found) == 4, (identity, len(found))
        # Keep the complete original crop rectangle even where its last pixel
        # was key spill. Closure audits must not confuse despill with truncation.
        raw = [(rgba_component(rgb, labels, ident, original_components[i][1], defringe_radius=12, spill_tolerance=0), list(original_components[i][1])) for i, (_, bounds, ident) in enumerate(found)]
        scale = HEIGHT[identity]*PIXEL_RATIO / np.median([im.height for im, _ in raw[:2]])
        original = Image.open(OUT/hero['image']).convert('RGBA')
        previous = {k:f for k,f in hero['frames'].items() if not k.startswith('seated_back_')}
        count = len(previous)
        sheet = Image.new('RGBA', (6*FW, math.ceil((count+4)/6)*FH))
        sheet.paste(original, (0,0))
        hero['frames'] = previous
        for i, (key, (im, box)) in enumerate(zip(KEYS, raw)):
            rendered, meta = cell(im, round(im.height*scale), name)
            x, y = ((count+i)%6)*FW, ((count+i)//6)*FH
            sheet.paste(rendered, (x,y))
            hero['frames'][key] = {'x':x,'y':y,'w':FW,'h':FH, **meta, **source_meta(filename,box,key,i)}
            tile = Image.new('RGBA', (FW,FH), '#51483f'); tile.alpha_composite(rendered)
            board.paste(tile.resize((288,300)), ((i+1)*288,row*320))
        f=hero['frames']['work']; tile=Image.new('RGBA',(FW,FH),'#51483f');tile.alpha_composite(original.crop((f['x'],f['y'],f['x']+FW,f['y']+FH)))
        board.paste(tile.resize((288,300)),(0,row*320));ImageDraw.Draw(board).text((0,row*320+300),identity,fill='white')
        hero['seated_back'] = list(KEYS)
        hero['seated_back_source'] = {'file':filename,'size':list(rgb.size),'sha256':hashlib.sha256((SRC/filename).read_bytes()).hexdigest(),'scale':float(scale),'reference':'same hero standing work head/shoulders; uniform source scale across all four cells'}
        temporary=OUT/(hero['image']+'.tmp')
        sheet.save(temporary, format='PNG', optimize=True)
        temporary.replace(OUT/hero['image'])
        review[identity] = hero['seated_back_source']
    (OUT/'atlas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    QA.mkdir(exist_ok=True);board.save(QA/'office19-art-review.jpg',quality=95)
    (QA/'office19-art-review.json').write_text(json.dumps(review,indent=2)+'\n')
    print(json.dumps(review,indent=2))

if __name__ == '__main__': main()
