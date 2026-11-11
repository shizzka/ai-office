#!/usr/bin/env python3
"""Validate the actual RGBA atlases and reviewed animation metadata."""
from pathlib import Path
import json
import statistics
import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT/'public/heroes-ai'


def validate_frame_boundaries(alpha, foot, identity):
    """Common source-pixel border rule for every legacy and HD atlas cell."""
    pixels=np.asarray(alpha)
    assert not pixels[0].any(), (*identity,'alpha touches cell top')
    assert not pixels[:,0].any(), (*identity,'alpha touches cell left')
    assert not pixels[:,-1].any(), (*identity,'alpha touches cell right')
    bottom=np.flatnonzero(pixels[-1])
    if len(bottom):
        assert abs(alpha.height-1-foot[1]) <= 3, (*identity,'bottom alpha is away from foot baseline')
        assert all(abs(int(px)-foot[0]) <= alpha.width*.25 for px in bottom), (*identity,'non-foot alpha touches bottom')


def validate_all_boundaries():
    result={}
    for directory in ('heroes','heroes-ai'):
        atlas_dir=ROOT/'public'/directory
        manifest=json.loads((atlas_dir/'atlas.json').read_text())
        count=0
        for name,hero in manifest['heroes'].items():
            image=Image.open(atlas_dir/hero['image']).convert('RGBA')
            for key,meta in hero['frames'].items():
                x,y,w,h=(meta[k] for k in ('x','y','w','h'))
                alpha=image.crop((x,y,x+w,y+h)).getchannel('A')
                validate_frame_boundaries(alpha,meta.get('foot',meta.get('foot_anchor')),(directory,name,key))
                count+=1
        result[directory]={'heroes':len(manifest['heroes']),'frames':count}
    return result


def validate():
    manifest = json.loads((OUT/'atlas.json').read_text())
    ratio = manifest['pixel_ratio']
    fw, fh = manifest['frame_size']
    assert ratio == 6 and [fw,fh] == [576,600]
    assert manifest['logical_frame_size'] == [96,100]
    assert 'walk_sequence' not in manifest
    assert len(manifest['heroes']) == 14
    result = {}
    for name, hero in manifest['heroes'].items():
        image = Image.open(OUT/hero['image'])
        assert image.mode == 'RGBA', name
        assert image.width <= 4096, name
        assert not any('mirror' in k for k in hero), name
        frames = {}
        heights = {}
        for key, meta in hero['frames'].items():
            x,y,w,h = (meta[k] for k in ('x','y','w','h'))
            assert [w,h] == [fw,fh], (name,key)
            assert 0 <= x and 0 <= y and x+w <= image.width and y+h <= image.height, (name,key)
            assert meta['foot'] == [48*ratio,96*ratio], (name,key)
            assert 0 <= meta['head'][1] < meta['foot'][1], (name,key)
            assert 0 <= meta['label_anchor'][1] <= meta['head'][1], (name,key)
            assert len(meta['source_bounds']) == 4 and meta['source'], (name,key)
            # A clean packed-cell border does not prove a clean source crop.
            # Reject the historical artificial quarter cuts before padding/fitting.
            if meta['source'].startswith('hero-'):
                source_width = hero.get('source_size', [3168])[0]
                quarter = source_width//4
                left,right = meta['source_bounds'][0],meta['source_bounds'][2]
                internal_cuts = {quarter,quarter*2,quarter*3}
                assert left not in internal_cuts and right not in internal_cuts, (name,key,'source silhouette cut at quarter boundary',meta['source_bounds'])
            frame = image.crop((x,y,x+w,y+h))
            alpha = frame.getchannel('A')
            # Every frame gets an actual pixel-boundary check. Even faint alpha
            # must stay clear of the top/sides; only feet may touch the bottom.
            validate_frame_boundaries(alpha,meta['foot'],('heroes-ai',name,key))
            # Ignore subpixel LANCZOS lobes and the intentionally faint cat rim.
            bbox = alpha.point(lambda value: 255 if value >= 128 else 0).getbbox()
            assert bbox, (name,key,'empty')
            # A placed chair's original wheels extend below its carrier's
            # anatomical feet. Validate their recorded extent without moving
            # the common human anchor or clipping the prop.
            ground = meta.get('ground_extent', meta['foot'][1])
            if 'ground_extent' in meta:
                assert (name, key, meta['source']) == ('ivanych', 'chair_place', 'ivanych-chair.png')
                assert meta['foot'][1] < ground < fh
            assert abs(bbox[3]-ground) <= 3, (name,key,'foot/prop ground baseline',bbox)
            heights[key] = bbox[3]-bbox[1]
            frames[key] = frame
        assert all(key in frames for key in ('work','walk','stretch','cup')), name
        cycle = hero['walk_cycle']
        assert len(cycle) in (1,4), name
        if len(cycle) == 4:
            hs = [heights[key] for key in cycle]
            center = statistics.median(hs)
            assert all(abs(height/center-1) <= .06 for height in hs), (name,'height pumping',hs)
            leg_changes = []
            for i,key in enumerate(cycle):
                other = cycle[(i+1)%len(cycle)]
                top = int(hero['frames'][key]['foot'][1]-center*.32)
                a,b = (np.asarray(frames[k])[top:hero['frames'][key]['foot'][1]].astype(np.int16) for k in (key,other))
                visible = (a[:,:,3]>64)|(b[:,:,3]>64)
                changed = (np.max(np.abs(a-b),axis=2)>32)&visible
                count = int(changed.sum())
                fraction = count/max(1,int(visible.sum()))
                assert count>100 and fraction>.025, (name,'legs are static',key,other,count,fraction)
                leg_changes.append({'pair':[key,other],'changed_pixels':count,'fraction':fraction})
            for i,key in enumerate(cycle):
                for other in cycle[:i]:
                    assert frames[key].tobytes() != frames[other].tobytes(), (name,'duplicate',key,other)
                    assert frames[key].tobytes() != ImageOps.mirror(frames[other]).tobytes(), (name,'mirrored',key,other)
        owner_four_poses = name == 'mikhalych' and hero['source'].startswith('hero-whoami-gpt-')
        if owner_four_poses:
            assert {key for key in frames if not key.startswith('seated_back_')} == {'work','walk','stretch','cup'}, name
            assert cycle == ['walk'] and 'typing' not in hero and 'animation_source' not in hero, name
        if name not in ('motya','lyuda','sharik') and not owner_four_poses:
            activity = 'tail' if name in ('korzhik','masyanya') else 'typing'
            assert len(hero[activity]) == 2, name
            assert all(key in frames for key in hero[activity]), name
            if activity == 'tail':
                # Sitting activities retain the low base sit, not walk height.
                assert all(abs(heights[key]/heights['work']-1) < .06 for key in hero[activity]), (name,'sit scale')
        result[name] = {'atlas': list(image.size), 'frame_count': len(frames),
                        'approved_walk': cycle, 'leg_changes':leg_changes if len(cycle)==4 else [], 'alpha_heights_px': heights}
    return result


if __name__ == '__main__':
    result = validate()
    (ROOT/'output').mkdir(exist_ok=True)
    (ROOT/'output/office15-art-validation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f'Validated {len(result)} RGBA atlases; all frames/anchors in bounds, approved walks within ±6%, no duplicate or mirrored walk cells.')
