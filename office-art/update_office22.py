#!/usr/bin/env python3
"""Append reviewed OFFICE-22 source poses without changing existing atlas pixels."""
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from cut_ai_art import SRC, OUT, QA, FW, FH, FOOT, PIXEL_RATIO, S, chroma_mask, rgba_component

KORZHIK_SWIPE_MASK = [(0,0),(1280,0),(1280,420),(1296,424),(1307,429),(1310,436),(1307,444),(1300,448),(1300,458),(1296,465),(1288,473),(1282,486),(1280,821),(0,821)]
HEROES = ('korzhik', 'masyanya', 'marina')
KEYS = {n: [f'run_{i}' for i in range(1,5)] + ([f'scene_{p}' for p in ('angry','sweep','carry','happy')] if n=='marina' else [f'scene_{p}' for p in ('crouch','jump','swipe','guilty')]) for n in HEROES}

def digest(im):
    return hashlib.sha256(im.tobytes()).hexdigest()

def raw_regions(filename, name, boxes):
    rgb=Image.open(SRC/filename).convert('RGB')
    full=chroma_mask(rgb,name,'scene')
    source_full=full.copy()
    a=np.asarray(rgb).astype(np.int16)
    # These scene sheets contain no magenta costume; remove key-coloured
    # islands inside tails, leaves and whiskers as well as exterior background.
    full &= ~((a[:,:,0]>130)&(a[:,:,2]>120)&(np.minimum(a[:,:,0],a[:,:,2])-a[:,:,1]>70))
    result=[]
    for i,box in enumerate(boxes):
        mask=np.zeros(full.shape,dtype=bool)
        x0,y0,x1,y1=box;mask[y0:y1,x0:x1]=source_full[y0:y1,x0:x1]
        if name=='korzhik' and i==6:
            # Trace the cat/pot contact around the extended toes. All shelf,
            # leaves, soil and pot pixels to the right are explicitly excluded.
            trace=Image.new('1',rgb.size)
            ImageDraw.Draw(trace).polygon(KORZHIK_SWIPE_MASK,fill=1)
            mask &= np.asarray(trace,dtype=bool)
        yy,xx=np.where(mask)
        bounds=[max(0,int(xx.min())-2),max(0,int(yy.min())-2),min(rgb.width,int(xx.max()+3)),min(rgb.height,int(yy.max()+3))]
        mask &= full
        # Each region retains detached original whiskers and painted cues.
        im=rgba_component(rgb,mask.astype(np.int32),1,bounds,defringe_radius=4,spill_tolerance=0)
        result.append((im,bounds))
    return result

def render(im,scale):
    im=im.crop(im.getbbox())
    size=(round(im.width*scale),round(im.height*scale))
    assert size[0]<FW-24 and size[1]<FOOT[1]-6,size
    resized=im.resize(size,S)
    x=(FW-size[0])//2;y=FOOT[1]-size[1]
    result=Image.new('RGBA',(FW,FH));result.alpha_composite(resized,(x,y))
    return result,dict(foot=FOOT.copy(),head=[FOOT[0],y],label_anchor=[FOOT[0],max(0,y-24)],silhouette_height=size[1])

def main():
    manifest=json.loads((OUT/'atlas.json').read_text())
    choice=json.loads((SRC.parent/'CHOICE.json').read_text())
    QA.mkdir(exist_ok=True)
    report={'pixel_ratio':PIXEL_RATIO,'frame_size':[FW,FH],'foot':FOOT,'heroes':{},'props':{}}
    board=Image.new('RGBA',(8*288,3*326),'#51483e');draw=ImageDraw.Draw(board)
    for row,name in enumerate(HEROES):
        filename=choice['scenes'][name]
        # Boundaries fall in clear magenta gaps, never artificial quarters.
        splits=([0,500,950,1440,1916] if name=='korzhik' else [0,523,950,1420,1916] if name=='masyanya' else [0,500,950,1380,1916])
        bottom=([0,470,1015,1480,1916] if name=='korzhik' else [0,470,1050,1470,1916] if name=='masyanya' else [0,480,970,1430,1916])
        cut=335 if name in ('korzhik','masyanya') else 399
        # Masyanya's first row reaches 350; second row starts at 371.
        if name=='masyanya':cut=360
        boxes=[(splits[i],0,splits[i+1],cut) for i in range(4)]+[(bottom[i],cut,bottom[i+1],821) for i in range(4)]
        raws=raw_regions(filename,name,boxes)
        hero=manifest['heroes'][name]
        reference='scene_happy' if name=='marina' else 'scene_guilty'
        target=hero['frames']['work']['silhouette_height']
        scale=target/raws[7][0].crop(raws[7][0].getbbox()).height
        old=Image.open(OUT/hero['image']).convert('RGBA')
        old_frames={k:f for k,f in hero['frames'].items() if k not in KEYS[name]}
        baseline=max(f['y']+f['h'] for f in old_frames.values())
        start_row=math.ceil(baseline/FH)
        atlas=Image.new('RGBA',(old.width,(start_row+2)*FH));atlas.paste(old.crop((0,0,old.width,start_row*FH)),(0,0))
        before={k:digest(old.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']))) for k,f in old_frames.items()}
        entries=[]
        for i,((raw,bounds),key) in enumerate(zip(raws,KEYS[name])):
            im,meta=render(raw,scale);x=(i%6)*FW;y=(start_row+i//6)*FH
            atlas.paste(im,(x,y))
            f=dict(x=x,y=y,w=FW,h=FH,**meta,source=filename,source_bounds=bounds,source_pose=key,source_index=i,source_scale=scale)
            if name=='korzhik' and i==6:
                f['source_mask']='Manual cat-only contact trace; pot, shelf, soil and leaves excluded.'
                f['source_mask_polygon']=KORZHIK_SWIPE_MASK
            hero['frames'][key]=f
            alpha=np.asarray(im)[:,:,3];ys,xs=np.where(alpha>0)
            rgb=np.asarray(im)[:,:,:3].astype(int)
            magenta=(alpha>100)&(rgb[:,:,0]>155)&(rgb[:,:,2]>145)&(rgb[:,:,1]<115)&(np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1]>90)
            assert not magenta.any(),(name,key,'magenta')
            assert xs.min()>0 and xs.max()<FW-1 and ys.min()>0 and ys.max()<FH-1
            entries.append(dict(key=key,source_bounds=bounds,silhouette_height=meta['silhouette_height'],alpha_bounds=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],magenta_pixels=int(magenta.sum())))
            tile=Image.new('RGBA',(288,300),'#51483e');tile.alpha_composite(im.resize((288,300),S));board.alpha_composite(tile,(i*288,row*326+26));draw.text((i*288+6,row*326+6),name+' '+key,fill='white')
        assert all(before[k]==digest(atlas.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']))) for k,f in old_frames.items())
        assert digest(old.crop((0,0,old.width,start_row*FH)))==digest(atlas.crop((0,0,old.width,start_row*FH)))
        atlas.save(OUT/hero['image'],optimize=True)
        hero['run_cycle']=KEYS[name][:4];hero['scene_poses']=KEYS[name][4:]
        hero['scene_source']=filename
        hero['scene_source_sha256']=hashlib.sha256((SRC/filename).read_bytes()).hexdigest()
        hero['scene_normalization']={'reference_pose':reference,'reference_height':target,'source_scale':scale,'reason':'One scale for all eight source poses, normalized by standing human or seated cat body height. Raised tails and upright swipe retain their true pose height.'}
        report['heroes'][name]={'image':hero['image'],'atlas_size':list(atlas.size),'old_frame_count':len(old_frames),'old_frames_pixel_identical':True,'old_canvas_pixel_identical':True,'normalization':hero['scene_normalization'],'frames':entries}
    filename=choice['props_pot']
    props=raw_regions(filename,'props',[(0,0,440,821),(440,0,850,821),(850,0,1470,821),(1470,0,1916,821)])
    pb=Image.new('RGBA',(4*576,700),'#eee5d3');pd=ImageDraw.Draw(pb)
    for i,(key,(im,bounds)) in enumerate(zip(('whole','falling','broken','broom'),props)):
        im=im.crop(im.getbbox())
        padded=Image.new('RGBA',(im.width+16,im.height+16));padded.alpha_composite(im,(8,8))
        file=f'pot-{key}.png';padded.save(OUT/file,optimize=True)
        info={'image':file,'w':padded.width,'h':padded.height,'pixel_ratio':PIXEL_RATIO,'anchor':[padded.width//2,padded.height-8],'source':filename,'source_bounds':bounds,'padding':8}
        arr=np.asarray(padded); rgb=arr[:,:,:3].astype(int); alpha=arr[:,:,3]
        magenta=(alpha>100)&(rgb[:,:,0]>155)&(rgb[:,:,2]>145)&(rgb[:,:,1]<115)&(np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1]>90)
        assert not magenta.any(),file
        info['magenta_pixels']=int(magenta.sum())
        report['props'][key]=info
        pb.alpha_composite(padded,(i*576+(576-padded.width)//2,100));pd.text((i*576+10,20),file,fill='#302a27')
    manifest['pot_props']=report['props']
    (OUT/'atlas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    board.convert('RGB').save(QA/'office22-art-scenes.jpg',quality=96)
    pb.convert('RGB').save(QA/'office22-art-props.png')
    edges=Image.new('RGBA',(4*576,2*620),'#eee5d3')
    for i,key in enumerate(('whole','falling','broken','broom')):
        im=Image.open(OUT/f'pot-{key}.png').convert('RGBA')
        for row,color in enumerate(('#eee5d3','#302a27')):
            tile=Image.new('RGBA',(576,620),color);tile.alpha_composite(im,((576-im.width)//2,(620-im.height)//2));edges.alpha_composite(tile,(576*i,620*row))
    edges.convert('RGB').save(QA/'office22-art-prop-edges.png')
    (QA/'office22-art-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
