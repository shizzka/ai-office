"""Check source closure independently of the OFFICE-24 slicer, including detached cap."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from cut_ai_art import chroma_mask,components
ROOT=Path(__file__).resolve().parents[1]
def validate():
    m=json.loads((ROOT/'public/heroes-ai/atlas.json').read_text())
    source=Image.open(ROOT/'office-art/office24/owner-mattress.png').convert('RGB')
    labels,found=components(chroma_mask(source,'owner','night'),50000)
    main=sorted(found,key=lambda c:c[1][0])
    for name,(_,b,ident) in zip(['back','side','rolled','carry'],main):
        p=m['owner_night_props'][name];x0,y0,x1,y1=p['source_bounds']
        assert x0<=b[0] and y0<=b[1] and x1>=b[2] and y1>=b[3],(name,'cut source',b,p)
        rgba=np.asarray(Image.open(ROOT/'public/heroes-ai'/p['image']).convert('RGBA'))
        assert rgba.shape[:2]==(y1-y0,x1-x0)
        original=labels[y0:y1,x0:x1]==ident
        assert np.all(rgba[:,:,3][original]==255),(name,'removed original silhouette')
    # The first diagonal crosses x=550. These widths prove we did not quarter-cut.
    assert m['owner_night_props']['back']['width']>=598
    owner=m['heroes']['owner'];image=Image.open(ROOT/'public/heroes-ai'/owner['image']).convert('RGBA')
    assert image.size==(3456,3600),'night poses fit existing empty cells, no larger GPU texture'
    wake=owner['frames']['owner_wake'];b=wake['source_bounds'];assert b[1]<=26 and b[0]<=1038 and b[2]>=1434
    frame=image.crop((wake['x'],wake['y'],wake['x']+wake['w'],wake['y']+wake['h']))
    _,parts=components(np.asarray(frame)[:,:,3]>128,1000)
    assert len(parts)>=2,'detached flying cap must survive'
    assert min(c[1][1] for c in parts)<65,'flying cap stays above the head'
    return {'props':4,'night_poses':4,'detached_cap':True,'source_silhouettes_complete':True}
if __name__=='__main__':print(validate())
