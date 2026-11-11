#!/usr/bin/env python3
"""Pixel acceptance and documented head measurements for OFFICE-18b."""
import hashlib
import json

import numpy as np
from PIL import Image

from cut_ai_art import OUT, SRC, QA, PIXEL_RATIO
from validate_ai_atlas import validate_frame_boundaries


def validate():
    manifest = json.loads((OUT/'atlas.json').read_text())
    choice = json.loads((SRC.parent/'CHOICE.json').read_text())
    hero = manifest['heroes']['mikhalych']
    assert hero['source'] == choice['whoami'] == 'hero-whoami-gpt-2.png'
    assert hero['source_sha256'] == hashlib.sha256((SRC/hero['source']).read_bytes()).hexdigest()
    image = Image.open(OUT/hero['image']).convert('RGBA')
    result = {'source': hero['source'], 'frames': {}}
    board = Image.new('RGB', (4*576, 2*600))
    for column, (key, frame) in enumerate((key, hero['frames'][key]) for key in ('work','walk','stretch','cup')):
        x, y, w, h = (frame[k] for k in ('x','y','w','h'))
        im = image.crop((x,y,x+w,y+h))
        alpha = im.getchannel('A')
        validate_frame_boundaries(alpha, frame['foot'], ('whoami', key))
        a = np.asarray(im).astype(np.int16)
        pink = (a[:,:,3]>32) & (np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1]>65) & (a[:,:,0]>100) & (a[:,:,2]>100)
        assert not pink.any(), (key, 'magenta spill')
        bounds = alpha.point(lambda a: 255 if a >= 128 else 0).getbbox()
        result['frames'][key] = {'opaque_bbox': list(bounds), 'height_logical': (bounds[3]-bounds[1])/PIXEL_RATIO, 'magenta_pixels': int(pink.sum())}
        for row, color in enumerate(('#eee5d3', '#302a27')):
            tile = Image.new('RGBA', im.size, color)
            tile.alpha_composite(im)
            board.paste(tile.convert('RGB'), (column*w, row*h))
        if key == 'cup':
            # Independently reviewed source rectangle of the detached mug steam.
            # Its pixels must survive, even though the main figure's bbox already
            # encloses this rectangle and a crop-boundary audit alone misses it.
            left, top, right, bottom = frame['source_bounds']
            scale = frame['silhouette_height']/(bottom-top)
            offset_x = (w-round((right-left)*scale))//2
            offset_y = frame['foot'][1]-frame['silhouette_height']
            sx0, sy0, sx1, sy1 = 1778, 170, 1804, 229
            box = [round(offset_x+(sx0-left)*scale), round(offset_y+(sy0-top)*scale),
                   round(offset_x+(sx1-left)*scale), round(offset_y+(sy1-top)*scale)]
            steam = np.asarray(alpha.crop(box)) >= 128
            assert steam.sum() > 100, ('missing detached steam', int(steam.sum()))
            result['steam'] = {'atlas_frame_bounds': box, 'visible_pixels': int(steam.sum())}
    # Visual landmarks, reviewed on the original work/cup poses. Head includes
    # hair/hood/cap at the crown and ends at the chin (not the neck or scarf).
    # Chin selection is manual to about ±5 source pixels, so ratios are estimates.
    landmarks = {'mikhalych': (62, 244), 'leha': (127, 520), 'ivanych': (139, 505)}
    heads = {}
    for name, (crown, chin) in landmarks.items():
        f = manifest['heroes'][name]['frames']['work']
        scale = f['silhouette_height']/(f['source_bounds'][3]-f['source_bounds'][1])
        head = (chin-crown)*scale/PIXEL_RATIO
        body = f['silhouette_height']/PIXEL_RATIO
        heads[name] = {'source_crown_y': crown, 'source_chin_y': chin,
                       'head_logical': head, 'body_logical': body, 'head_to_body': head/body}
    result['head_measurement'] = {'method': 'Manual crown (including hood/cap/hair) to chin, original work poses; chin accuracy about +/-5 source px.',
                                  'heroes': heads,
                                  'whoami_to_leha': heads['mikhalych']['head_logical']/heads['leha']['head_logical'],
                                  'whoami_to_ivanych': heads['mikhalych']['head_logical']/heads['ivanych']['head_logical']}
    QA.mkdir(exist_ok=True)
    board.save(QA/'office18b-alpha-edges.png')
    (QA/'office18b-art-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    return result


if __name__ == '__main__':
    print(json.dumps(validate(), ensure_ascii=False, indent=2))
