#!/usr/bin/env python3
"""Check complete source silhouettes, independently of padded atlas cell edges."""
import json
from pathlib import Path
from collections import defaultdict
import numpy as np
from PIL import Image, ImageDraw
from cut_ai_art import SRC, OUT, QA, chroma_mask, components, rgba_component, cell, whoami_components


def source_components(filename,name):
    # OFFICE-23b's additional pose is a local transparent source, not a
    # magenta-keyed bridge sheet. Audit its actual alpha silhouette as well.
    if filename.startswith('office23b/'):
        rgba=Image.open(Path(__file__).parent/filename).convert('RGBA')
        labels,found=components(np.asarray(rgba)[:,:,3]>0,10000)
        return rgba.convert('RGB'),labels,found
    rgb=Image.open((Path(__file__).parent/filename) if filename.startswith('office24/') else SRC/filename).convert('RGB')
    if filename.startswith('hero-whoami-gpt-'):
        labels,found=whoami_components(rgb)
        return rgb,labels,found
    base=filename.startswith(('hero-','cat-poses-'))
    v2=filename in ('hero-masyanya-v2-1.png','cat-poses-masyanya-v2-1.png','anim-masyanya-v2-1.png')
    kind='v2' if v2 else ('base' if base else ('animation' if filename.startswith('anim-') else 'walk2'))
    mask=chroma_mask(rgb,name,kind)
    if filename=='hero-masyanya-v2-1.png':
        mask[1082:,:680]=False;mask[1120:,:1716]=False;mask[1155:]=False
        a=np.asarray(rgb).astype(np.int16);yy=np.indices(mask.shape)[0]
        mask &= ~((yy>1000)&(np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1]>15))
    if base and name=='motya':mask[1151:,2376:]=False;mask[1001:,2887:]=False
    if filename.startswith('walk2-') and name=='masyanya':mask[1050:]=False
    labels,found=components(mask,10000)
    return rgb,labels,found


def audit(repair=False):
    manifest=json.loads((OUT/'atlas.json').read_text());groups=defaultdict(list);report=[];repairs=[];atlases={}
    for name,hero in manifest['heroes'].items():
        for key,f in hero['frames'].items():groups[(name,f['source'])].append((key,f))
    for (name,filename),frames in groups.items():
        rgb,labels,found=source_components(filename,name)
        for key,f in frames:
            b=f['source_bounds']
            frame_labels,frame_found=labels,found
            if 'source_mask_polygon' in f:
                # The only reviewed source exclusion is the pot/shelf touching
                # Korzhik's paw. Check its full masked silhouette, not a waiver.
                approved=[[0,0],[1280,0],[1280,420],[1296,424],[1307,429],[1310,436],[1307,444],[1300,448],[1300,458],[1296,465],[1288,473],[1282,486],[1280,821],[0,821]]
                assert (name,filename,key)==('korzhik','scene-korzhik-run.png','scene_swipe')
                assert f['source_mask_polygon']==approved
                trace=Image.new('1',rgb.size);ImageDraw.Draw(trace).polygon([tuple(p) for p in approved],fill=1)
                mask=chroma_mask(rgb,name,'scene') & np.asarray(trace,dtype=bool)
                frame_labels,frame_found=components(mask,10000)
            def overlap(c):
                x=c[1];return max(0,min(x[2],b[2])-max(x[0],b[0]))*max(0,min(x[3],b[3])-max(x[1],b[1]))
            _,box,ident=max(frame_found,key=overlap)
            closed=all((box[0]>=b[0],box[1]>=b[1],box[2]<=b[2],box[3]<=b[3]))
            entry={'hero':name,'pose':key,'source':filename,'claimed_bounds':b,'component_bounds':list(box),'closed':closed}
            if not closed and repair:
                raw=rgba_component(rgb,frame_labels,ident,box);rendered,meta=cell(raw,f['silhouette_height'],name)
                hero=manifest['heroes'][name]
                if name not in atlases:atlases[name]=Image.open(OUT/hero['image']).convert('RGBA')
                atlases[name].paste(rendered,(f['x'],f['y']))
                hero['frames'][key]={**f,**meta,'source_bounds':list(box)}
                repairs.append(entry);entry={**entry,'claimed_bounds':list(box),'closed':True}
            report.append(entry)
    if repair:
        for name,atlas in atlases.items():atlas.save(OUT/manifest['heroes'][name]['image'],optimize=True)
        (OUT/'atlas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    failures=[e for e in report if not e['closed']]
    result={'frames_checked':len(report),'sources_checked':len(groups),'failures':failures,'repairs':repairs,'frames':report}
    (QA/'office17-art-source-closure.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    assert not failures,failures
    return result

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--repair',action='store_true');args=p.parse_args()
    r=audit(args.repair);print(f"Checked {r['frames_checked']} source silhouettes across {r['sources_checked']} sheets; repaired {len(r['repairs'])} source crops.")
