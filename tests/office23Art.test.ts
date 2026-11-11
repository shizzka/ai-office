import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('OFFICE-23 supplied art retains original frames, complete alpha and aligned body anchors', () => {
  execFileSync('python3', ['-c', String.raw`
import hashlib,json
import numpy as np
from pathlib import Path
from PIL import Image
root=Path('public/heroes-ai')
m=json.loads((root/'atlas.json').read_text())
assert m['pixel_ratio']==6 and m['logical_frame_size']==[96,100]

def alpha_check(im):
    a=np.asarray(im)
    assert a.shape[2]==4
    alpha=a[:,:,3]
    ys,xs=np.where(alpha>0)
    assert len(xs)>100
    assert xs.min()>0 and xs.max()<im.width-1
    assert ys.min()>0 and ys.max()<im.height-1
    rgb=a[:,:,:3].astype(int)
    key=(alpha>100)&(rgb[:,:,0]>155)&(rgb[:,:,2]>145)&(rgb[:,:,1]<115)&(np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1]>90)
    assert not key.any(),'magenta fringe'
    assert alpha[0].max()==alpha[-1].max()==alpha[:,0].max()==alpha[:,-1].max()==0

expected={
'owner':['owner_breaker','owner_clap','owner_point','owner_pizza','owner_eat','owner_peek','owner_skeptic','owner_shrug'],
'ivanych':['chair_walk_1','chair_walk_2','chair_place','chair_rest']}
for name,keys in expected.items():
    h=m['heroes'][name]
    atlas=Image.open(root/h['image']).convert('RGBA')
    meta=h['office23_art']
    assert meta['frames']==keys
    assert len(meta['previous_frame_hashes'])>=14
    for k,digest in meta['previous_frame_hashes'].items():
        f=h['frames'][k]
        crop=atlas.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']))
        assert hashlib.sha256(crop.tobytes()).hexdigest()==digest,(name,k,'changed previous art')
    hashes=set()
    for i,k in enumerate(keys):
        f=h['frames'][k]
        assert f['source_index']==i and f['source_pose']==k
        assert f['source']==('owner-features.png' if name=='owner' else 'ivanych-chair.png')
        assert f['w']==576 and f['h']==600 and f['foot']==[288,576]
        assert f['x']+f['w']<=atlas.width and f['y']+f['h']<=atlas.height
        assert f['source_scale']==meta['source_scale']
        assert abs(f['head'][1]-(576-(f['source_foot'][1]-f['source_head'][1])*f['source_scale']))<=.51
        assert f['label_anchor'][1]==max(0,f['head'][1]-24)
        crop=atlas.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h']))
        alpha_check(crop)
        if k=='chair_place':
            ground=crop.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()[3]
            assert f['ground_extent']==ground and 576<ground<600
        else:
            assert 'ground_extent' not in f
        hashes.add(hashlib.sha256(crop.tobytes()).hexdigest())
    assert len(hashes)==len(keys),'poses must be distinct original art'
assert m['heroes']['owner']['name']=='Евгений'
# A held pizza stays in the owner's source frame: no erased prop and no
# renderer-dependent additional box is required to complete this silhouette.
pizza=m['heroes']['owner']['frames']['owner_pizza']
assert pizza['source_bounds'][2]>1750
assert pizza['source_bounds'][2]-pizza['source_bounds'][0]>290
assert set(m['pizza_props'])=={'closed','open','slice','last'}
for key,p in m['pizza_props'].items():
    im=Image.open(root/p['image']).convert('RGBA')
    assert p['image']==f'pizza-{key}.png'
    assert im.size==(p['w'],p['h']) and p['pixel_ratio']==m['pixel_ratio']
    assert p['anchor']==[im.width//2,im.height-p['padding']]
    alpha_check(im)
    a=np.asarray(im)[:,:,3]
    pad=p['padding']
    assert not a[:pad-2].any() and not a[-pad+2:].any()
print('12 source poses, 28 preserved frames and 4 transparent pizza props verified')
`], { cwd: process.cwd(), stdio: 'pipe' });
});
