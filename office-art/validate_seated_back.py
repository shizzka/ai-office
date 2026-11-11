#!/usr/bin/env python3
"""OFFICE-19: independent pixel QA for the eight appended seated sheets."""
import json
import numpy as np
from scipy import ndimage
from PIL import Image
from cut_ai_art import OUT, QA
from validate_ai_atlas import validate_frame_boundaries


def validate():
    m=json.loads((OUT/'atlas.json').read_text());report={}
    for identity,hero in m['heroes'].items():
        if not hero.get('seated_back'):continue
        sheet=Image.open(OUT/hero['image']);frames={}
        for key in hero['seated_back']:
            f=hero['frames'][key];im=sheet.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']))
            validate_frame_boundaries(im.getchannel('A'),f['foot'],(identity,key))
            a=np.asarray(im).astype(np.int16);r,g,b,alpha=[a[:,:,i] for i in range(4)]
            # Strict equal-R/B chroma check, distinct from Taya's painted pink.
            pink=(alpha>32)&(np.minimum(r,b)-g>95)&(abs(r-b)<60)&(r>145)&(b>145)&(g<130)
            if identity=='taya':
                # Beret and scarf are intentional. Only keyed-outline pixels
                # count as spill; retain the solid interior pink artwork.
                distance=ndimage.distance_transform_edt(alpha>32)
                pink &= distance<=1.5
                painted_pink=(alpha>128)&(r-g>50)&(b-g>20)&(r>150)&(b>100)
                assert int(painted_pink.sum())>2000,(key,'missing painted beret/scarf')
            assert not pink.any(),(identity,key,'magenta key remaining',int(pink.sum()))
            bounds=im.getbbox();assert bounds and bounds[3]<=f['foot'][1]+1
            frames[key]={'bounds':list(bounds),'key_spill_pixels':int(pink.sum())}
        assert len(frames)==4
        report[identity]=frames
    assert len(report)==8
    (QA/'office19-art-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    return report

if __name__=='__main__':
    validate();print('32 original seated cells: clear borders, wheel anchors and no magenta key spill; pink beret retained.')
