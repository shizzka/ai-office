#!/usr/bin/env python3
"""Replace only selected walk cells, preserving OFFICE-15 HD cells and anchors."""
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw
from cut_ai_art import SRC, OUT, QA, chroma_mask, components, rgba_component, cell, FW, FH

manifest = json.loads((OUT/'atlas.json').read_text())
choice = json.loads((SRC.parent/'CHOICE.json').read_text())
review = {}
board = Image.new('RGBA', (4*FW, 5*FH), '#52473f')
for row,(name,filename) in enumerate(choice['walk2'].items()):
    hero = manifest['heroes'][name]
    rgb = Image.open(SRC/filename).convert('RGB')
    mask = chroma_mask(rgb, name, 'walk2')
    if name == 'masyanya':
        # Reviewed original: paws end above y1000; the generated room starts at y1080.
        mask[1050:] = False
    labels, found = components(mask, 10000)
    assert len(found) == 4, (name, [(a,b) for a,b,_ in found])
    found.sort(key=lambda c:c[1][0])
    raw = [(rgba_component(rgb,labels,ident,box),box) for _,box,ident in found]
    old = hero['walk_cycle']
    target = np.median([hero['frames'][k]['silhouette_height'] for k in old])
    scale = target/np.median([im.height for im,_ in raw])
    atlas = Image.open(OUT/hero['image']).convert('RGBA')
    for i,(im,box) in enumerate(raw):
        key = f'walk_{i+1}'
        f = hero['frames'][key]
        rendered,meta = cell(im, round(im.height*scale),name)
        atlas.paste(rendered,(f['x'],f['y']))
        hero['frames'][key] = {**{k:f[k] for k in ('x','y','w','h')},**meta,
            'source':filename,'source_bounds':list(box),'source_pose':key,'source_index':i}
        board.alpha_composite(rendered,(i*FW,row*FH))
    atlas.save(OUT/hero['image'],optimize=True)
    hero['walk_cycle'] = [f'walk_{i}' for i in range(1,5)]
    hero['walk_source'] = filename
    hero['walk_source_sha256'] = hashlib.sha256((SRC/filename).read_bytes()).hexdigest()
    hero['walk_review'] = {'status':'accepted','reason':'Selected OFFICE-16 walk2; original four leg phases, common scale and foot baseline.'}
    review[name] = {'source':filename,'bounds':[list(b) for _,b in raw], 'target_height':float(target),
        'heights':[hero['frames'][k]['silhouette_height'] for k in hero['walk_cycle']], 'scale':float(scale)}
(OUT/'atlas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(QA/'office16-walk-review.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
board.thumbnail((1152,1500)); board.convert('RGB').save(QA/'office16-walk-atlas.jpg',quality=95)
print(json.dumps(review,indent=2))
