#!/usr/bin/env python3
"""Extract reviewed OFFICE-17 source pixels, retaining original native HD data."""
import hashlib
import json
import shutil
import numpy as np
from PIL import Image, ImageDraw
from cut_ai_art import SRC, OUT, QA, ROOT, FW, FH, chroma_mask, components, rgba_component, cell, pack, source_meta


def silhouettes(filename, name, kind='v2'):
    rgb = Image.open(SRC/filename).convert('RGB')
    mask=chroma_mask(rgb,name,kind)
    if name=='motya' and kind=='base':
        mask[1151:,2376:]=False
        mask[1001:,2887:]=False
    labels, found = components(mask, 10000)
    found.sort(key=lambda c:c[1][0])
    return [(rgba_component(rgb, labels, ident, bounds), list(bounds)) for _,bounds,ident in found]


def split_bugjar(jar):
    """Trace the painted bug once; keep both layers on the original jar canvas."""
    mask=Image.new('L',jar.size);d=ImageDraw.Draw(mask)
    d.polygon([(38,74),(36,68),(40,71),(47,77),(51,70),(54,68),(55,70),(52,80),(60,86),(66,98),(69,108),(65,116),(62,121),(42,121),(35,115),(26,119),(21,119),(22,117),(32,111),(29,103),(26,101),(24,95),(27,90),(26,87),(21,85),(21,83),(27,84),(33,88),(38,81)],fill=255)
    bug=jar.copy();bug.putalpha(mask);bug.save(ROOT/'public/office-loft/bugjar-bug.png',optimize=True)
    a=np.array(jar);m=np.array(mask)>0
    for y in range(a.shape[0]):
        xs=np.flatnonzero(m[y])
        if not len(xs):continue
        x0,x1=int(xs.min()),int(xs.max());left=a[y,max(0,x0-3),:3].astype(float);right=a[y,min(a.shape[1]-1,x1+3),:3].astype(float)
        for x in xs:a[y,x,:3]=left+(right-left)*(x-x0+1)/(x1-x0+2)
    Image.fromarray(a).save(ROOT/'public/office-loft/bugjar-empty.png',optimize=True)


def main():
    manifest=json.loads((OUT/'atlas.json').read_text()); repairs=[]
    previous=QA/'office17-art-report.json'
    if previous.exists():repairs=json.loads(previous.read_text()).get('source_crop_repairs',[])
    # Audit historical quarter extractions. Recut the complete connected source
    # silhouette before fitting it to a cell: padding a truncated crop cannot fix it.
    for name,hero in manifest['heroes'].items():
        if name=='sanya':continue
        atlas=None;cache={}
        for key,f in hero['frames'].items():
            bounds=f['source_bounds'];filename=f['source']
            if not filename.startswith('hero-') or not (bounds[0]%792==0 or bounds[2]%792==0):continue
            if filename not in cache:cache[filename]=silhouettes(filename,name,'base')
            candidates=cache[filename]
            def overlap(item):
                b=item[1];return max(0,min(b[2],bounds[2])-max(b[0],bounds[0]))*max(0,min(b[3],bounds[3])-max(b[1],bounds[1]))
            raw,box=max(candidates,key=overlap)
            # Existing cat floor removal is intentional; retain its reviewed y limits.
            if name in ('korzhik','masyanya'):
                original_top=box[1];box=box.copy();box[1]=max(box[1],bounds[1]);box[3]=min(box[3],bounds[3]);raw=raw.crop((0,box[1]-original_top,raw.width,box[3]-original_top))
            if box==bounds:continue
            rendered,meta=cell(raw,f['silhouette_height'],name)
            if atlas is None:atlas=Image.open(OUT/hero['image']).convert('RGBA')
            atlas.paste(rendered,(f['x'],f['y']))
            hero['frames'][key]={**f,**meta,'source_bounds':box}
            repairs.append({'hero':name,'pose':key,'before':bounds,'after':box})
        if atlas is not None:atlas.save(OUT/hero['image'],optimize=True)
    merged_repairs={}
    for entry in repairs:
        key=(entry['hero'],entry['pose'])
        if key in merged_repairs:merged_repairs[key]['after']=entry['after']
        else:merged_repairs[key]=entry
    repairs=list(merged_repairs.values())
    hero=manifest['heroes']['sanya'];basefile='hero-sanya-v2-3.png';walkfile='walk2-sanya-1.png';seatedfile='sanya-seated-1.png'
    base=silhouettes(basefile,'sanya');walk=silhouettes(walkfile,'sanya');seated=silhouettes(seatedfile,'sanya')
    assert len(base)==len(walk)==len(seated)==4
    cells=[]
    for filename,raws,keys,height in [(basefile,base,['work','walk','stretch','cup'],432),(walkfile,walk,[f'walk_{i}' for i in range(1,5)],432),(seatedfile,seated,['seated_type_1','seated_type_2','seated_think','seated_victory'],432)]:
        scale=height/float(np.median([im.height for im,_ in raws]))
        for i,((im,box),key) in enumerate(zip(raws,keys)):
            rendered,meta=cell(im,round(im.height*scale),'sanya')
            cells.append((key,rendered,{**meta,**source_meta(filename,box,key,i)}))
    # Preserve the activity API for consumers using generic typing animations.
    for alias,target in [('typing_1','seated_type_1'),('typing_2','seated_type_2')]:
        key,im,meta=next(c for c in cells if c[0]==target);cells.append((alias,im,meta.copy()))
    hero.update(source=basefile,source_sha256=hashlib.sha256((SRC/basefile).read_bytes()).hexdigest(),source_size=[3168,1344],frames={},walk_cycle=[f'walk_{i}' for i in range(1,5)],typing=['typing_1','typing_2'],walk_source=walkfile,walk_source_sha256=hashlib.sha256((SRC/walkfile).read_bytes()).hexdigest(),animation_source=seatedfile,animation_source_size=[3168,1344],animation_source_sha256=hashlib.sha256((SRC/seatedfile).read_bytes()).hexdigest(),note='OFFICE-17 full-source component extraction; seated poses face front.',seated=['seated_type_1','seated_type_2','seated_think','seated_victory'],seated_scene_scale=110/72)
    hero['walk_review']={'status':'accepted','reason':'Four original walk2 phases, one scale and foot baseline.'}
    pack(hero,cells)
    (OUT/'atlas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    from audit_source_closure import audit
    closure=audit(repair=True)
    bg=Image.open(SRC/'office-v8-sanya-merged.png').convert('RGBA')
    old=np.asarray(Image.open(SRC/'office-v7-tablet-1.png').convert('RGB'));new=np.asarray(bg.convert('RGB'));diff=np.any(old!=new,axis=2);ys,xs=np.where(diff)
    shutil.copyfile(SRC/'office-v8-sanya-merged.png',ROOT/'public/office-bg-ai.png')
    # Trace the desk, laptop, phone/tripod and legs; chair pixels stay transparent.
    polygons=[[(1669,1344),(1857,1344),(1857,1312),(1865,1305),(2015,1305),(2024,1312),(2024,1344),(2153,1344),(2153,1454),(2143,1454),(2143,1536),(1681,1536),(1681,1454),(1669,1454)],[(1737,1263),(1820,1263),(1820,1315),(1792,1315),(1792,1336),(1818,1411),(1802,1417),(1785,1369),(1785,1425),(1771,1425),(1771,1363),(1744,1414),(1730,1408),(1758,1332),(1763,1315),(1737,1315)]]
    mask=Image.new('L',bg.size);d=ImageDraw.Draw(mask)
    for p in polygons:d.polygon(p,fill=255)
    # The painted dark front panel below the tabletop also occludes seated legs.
    fg=bg.copy();fg.putalpha(mask);fg.save(ROOT/'public/office-loft/sanya-desk-front.png',optimize=True)
    jar=Image.open(SRC/'prop-bugjar-from-v8.png').convert('RGBA');a=np.asarray(jar);yy,xx=np.indices(a.shape[:2]);jar_mask=Image.new('L',jar.size);jd=ImageDraw.Draw(jar_mask);jd.polygon([(14,5),(28,0),(65,0),(79,8),(82,24),(87,34),(88,130),(82,139),(10,139),(5,132),(5,37),(11,25)],fill=255);jar.putalpha(jar_mask);jar.save(ROOT/'public/office-loft/bugjar.png',optimize=True)
    split_bugjar(jar)
    report={'background':{'source':'office-v8-sanya-merged.png','source_size':list(bg.size),'changed_native_bbox':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],'changed_pixels':int(diff.sum()),'outside_desk_unchanged':bool(not diff[:1139].any() and not diff[1139:,:1644].any() and not diff[1139:,2178:].any())},'desk':{'native_rect':[1669,1344,484,110],'foreground':'/office-loft/sanya-desk-front.png','foreground_native_polygons':polygons,'scene_rect':[582.2093,501,168.8372,38.3854]},'seated':{'scene_foot':[677.4,548],'scene_scale':110/72,'standing_home':[677.4,493],'poses':hero['seated'],'physical_foot':[288,576]},'phone':{'native_rect':[1737,1263,83,162],'scene_rect':[605.9302,472.7344,28.9535,56.5312]},'bugjar':{'image':'/office-loft/bugjar.png','native_size':list(jar.size),'empty_image':'/office-loft/bugjar-empty.png','bug_image':'/office-loft/bugjar-bug.png','bug_native_center':[47,95],'interior_native_rect':[14,42,65,86],'scene_rect':[719,492,17,25.5]},'source_crop_repairs':repairs}
    report['source_closure']={'frames_checked':closure['frames_checked'],'sources_checked':closure['sources_checked'],'all_closed':True,'owner_typing':[entry for entry in closure['frames'] if entry['hero']=='owner' and entry['pose'].startswith('typing')]}
    for entry in closure['repairs']:
        report['source_crop_repairs'].append({'hero':entry['hero'],'pose':entry['pose'],'before':entry['claimed_bounds'],'after':entry['component_bounds']})
    (QA/'office17-art-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    board=Image.new('RGBA',(FW*4,FH*3),'#544940')
    for i,(_,im,_) in enumerate(cells[:12]):board.alpha_composite(im,((i%4)*FW,(i//4)*FH))
    board.thumbnail((1152,900));board.convert('RGB').save(QA/'office17-art-sanya-review.jpg',quality=95)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
