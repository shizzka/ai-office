#!/usr/bin/env python3
"""Re-cut selected original OFFICE sheets, once, into source-derived HD cells.

No scene/background files are written. All geometry in the manifest is physical
pixels; consumers divide it by pixel_ratio to retain 96 x 100 logical cells.
"""
from pathlib import Path
import hashlib
import json
import math
import argparse
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = Path('/home/q/work/office-bridge/ai-art/out')
OUT = ROOT / 'public/heroes-ai'
QA = ROOT / 'output'
S = Image.Resampling.LANCZOS
PIXEL_RATIO = 6
FW, FH = 96 * PIXEL_RATIO, 100 * PIXEL_RATIO
FOOT = [48 * PIXEL_RATIO, 96 * PIXEL_RATIO]
COLS = 6
NAMES = {'yarik':'Ярик','leha':'Лёха','asya':'Ася','ivanych':'Иваныч','taya':'Тая','sanya':'Саня','motya':'Мотя','mikhalych':'whoami','lyuda':'Люда','sharik':'Шарик','owner':'Евгений','marina':'Марина','korzhik':'Коржик','masyanya':'Масяня'}
WORK = {'leha':3,'asya':3,'ivanych':3,'sanya':3,'lyuda':3,'sharik':3}
CATS = ('korzhik', 'masyanya')
ABSENT = ('motya', 'lyuda', 'sharik')
# Manual visual review of original leg contacts: these sheets repeat the same
# lead leg. Keep the source cells, but do not advertise a fabricated walk cycle.
REJECT_WALK = {
    'korzhik': 'Vertical/horizontal tail alternation changes silhouette height by 28%; source phases rejected to avoid body-size pumping.',
    'leha': 'Frames 1–3 repeat the same crossed lead foot; frame 4 only lowers it.',
    'marina': 'All four frames keep the same crossed lead foot; no opposite contact.',
    'taya': 'Frames 1, 3 and 4 repeat the same lead foot; frame 2 is only a passing pose.',
}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def chroma_mask(rgb, name, source_kind, source_index=None):
    """Key the original pixels, excluding explicitly reviewed generated floor."""
    a = np.asarray(rgb).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    key = (r > 155) & (b > 145) & (g < 115) & (np.minimum(r, b)-g > 90) & (abs(r-b) < 90)
    # Broad key is allowed only in the connected outside background. Pink
    # clothing inside its dark outline (notably Taya's beret) stays opaque.
    seeds = np.zeros(key.shape, dtype=bool)
    seeds[0, :] = key[0, :]; seeds[-1, :] = key[-1, :]
    seeds[:, 0] = key[:, 0]; seeds[:, -1] = key[:, -1]
    exterior = ndimage.binary_propagation(seeds, mask=key)
    pure_key = (r > 235) & (b > 235) & (g < 30)
    mask = ~(exterior | pure_key)
    yy, xx = np.indices(mask.shape)
    if source_kind == 'base':
        if name in CATS:
            mask[1156:] = False
        if name in ('asya', 'motya'):
            mask &= ~((yy > 1000) & (r > g*1.25) & (b > g*1.12) & (r > 95))
        if name == 'motya' and source_index == 3:
            mask &= ~((yy > 1150) | ((yy > 1000) & (xx > 510)))
    if name == 'masyanya' and source_kind == 'animation':
        # Source paws end at 1041. The unwanted office floor starts below 1100.
        mask[1100:] = False
    return mask


def components(mask, min_area=1):
    labels, _ = ndimage.label(mask)
    counts = np.bincount(labels.ravel())
    result = []
    for ident, section in enumerate(ndimage.find_objects(labels), 1):
        if section and counts[ident] >= min_area:
            ys, xs = section
            result.append((int(counts[ident]), (xs.start, ys.start, xs.stop, ys.stop), ident))
    return labels, result


def whoami_components(rgb):
    """Four complete GPT figures, including detached steam above the root mug."""
    labels, found = components(chroma_mask(rgb, 'mikhalych', 'base'), 30)
    bodies = sorted((c for c in found if c[0] >= 10000), key=lambda c: c[1][0])
    if len(bodies) != 4:
        raise ValueError(f'whoami: expected four silhouettes, found {len(bodies)}')
    for area, box, ident in found:
        if area >= 10000:
            continue
        quarter = min(3, int((box[0]+box[2])/2 * 4/rgb.width))
        labels[labels == ident] = bodies[quarter][2]
    # Recompute the union bounds after assigning disconnected props to a figure.
    boxes = ndimage.find_objects(labels)
    result = []
    for _, _, ident in bodies:
        ys, xs = boxes[ident-1]
        result.append((int((labels == ident).sum()), (xs.start, ys.start, xs.stop, ys.stop), ident))
    return labels, result


def rgba_component(rgb, labels, ident, bbox, defringe_radius=3, spill_tolerance=38):
    """Keep a connected silhouette and defringe key spill before LANCZOS."""
    x0, y0, x1, y1 = bbox
    rgb_arr = np.asarray(rgb)[y0:y1, x0:x1].copy()
    mask = labels[y0:y1, x0:x1] == ident
    # The crop itself can touch a crown/sole; include transparent pixels outside
    # it when measuring distance, otherwise the very top/bottom escapes despill.
    distance = ndimage.distance_transform_edt(np.pad(mask, 1))[1:-1, 1:-1]
    edge = mask & (distance <= defringe_radius)
    a = rgb_arr.astype(np.int16)
    spill = np.maximum(0, np.minimum(a[:, :, 0], a[:, :, 2])-a[:, :, 1]-spill_tolerance)
    spill = np.where(edge, spill, 0)
    a[:, :, 0] -= spill
    a[:, :, 2] -= spill
    rgba = np.zeros((*mask.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(a, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = mask.astype(np.uint8)*255
    return Image.fromarray(rgba)


def extract(source, name, idx, source_file=None):
    """Base sheet quarters are cut at their native 792 x 1344 resolution."""
    if source_file and source_file.startswith('hero-whoami-gpt-'):
        rgb = source.convert('RGB')
        labels, found = whoami_components(rgb)
        _, bbox, ident = found[idx]
        return rgba_component(rgb, labels, ident, bbox, defringe_radius=6, spill_tolerance=0), list(bbox)
    if source_file in ('hero-masyanya-v2-1.png', 'cat-poses-masyanya-v2-1.png'):
        # V2 silhouettes cross quarter boundaries: keep the whole tail/paws.
        rgb = source.convert('RGB')
        mask = chroma_mask(rgb, name, 'v2')
        if source_file.startswith('hero-'):
            # Reviewed floor limits. The lying cat's front paw reaches y=1150;
            # the sitting cat has a generated floor blended into its last rows.
            mask[1082:, :680] = False
            mask[1120:, :1716] = False
            mask[1155:] = False
            a = np.asarray(rgb).astype(np.int16)
            yy = np.indices(mask.shape)[0]
            mask &= ~((yy > 1000) & (np.minimum(a[:,:,0], a[:,:,2])-a[:,:,1] > 15))
        labels, found = components(mask, 10000)
        if len(found) != 4:
            raise ValueError(f'{source_file}: expected four silhouettes, found {len(found)}')
        found.sort(key=lambda c: c[1][0])
        _, bbox, ident = found[idx]
        return rgba_component(rgb, labels, ident, bbox), list(bbox)
    # A prop or raised arm may cross the artificial quarter boundary. Segment
    # the whole original sheet, then associate its silhouette with the quarter.
    cw = source.width // 4
    rgb = source.convert('RGB')
    mask = chroma_mask(rgb, name, 'base')
    if name == 'motya':
        mask[1151:, 3*cw:] = False
        mask[1001:, 3*cw+511:] = False
    labels, found = components(mask, 10000)
    def quarter_overlap(component):
        _, box, _ = component
        return max(0, min(box[2],(idx+1)*cw)-max(box[0],idx*cw))*(box[3]-box[1])
    _, bbox, ident = max(found, key=quarter_overlap)
    return rgba_component(rgb, labels, ident, bbox), list(bbox)



def animation_components(source, name, source_file=None):
    """Six components; Korzhik is laid out in two rows, not six columns."""
    rgb = source.convert('RGB')
    v2 = source_file == 'anim-masyanya-v2-1.png'
    labels, found = components(chroma_mask(rgb, name, 'v2' if v2 else 'animation'), 10000)
    expected = 7 if v2 else 6
    if len(found) != expected:
        raise ValueError(f'{name}: expected {expected} source components, found {len(found)}')
    if v2:
        found.sort(key=lambda c: (c[1][1] >= source.height//2, c[1][0]))
        # Fifth source figure is an extra walk, never a tail or a walk phase.
        found = found[:4] + found[5:]
    elif name == 'korzhik':
        found.sort(key=lambda c: (c[1][1] > 680, c[1][0]))
    else:
        found.sort(key=lambda c: c[1][0])
    return [(rgba_component(rgb, labels, ident, box), list(box)) for _, box, ident in found]


def light_cat_edge(im):
    alpha = im.getchannel('A')
    # Two physical pixels = one third logical pixel; no thick white cartoon rim.
    outer = alpha.filter(ImageFilter.MaxFilter(5))
    ring = np.maximum(0, np.asarray(outer).astype(np.int16)-np.asarray(alpha).astype(np.int16))
    edge = Image.new('RGBA', im.size, (218, 211, 188, 0))
    edge.putalpha(Image.fromarray((ring * .26).astype(np.uint8)))
    edge.alpha_composite(im)
    return edge


def cell(im, target_height, name):
    scale = target_height / im.height
    size = (max(1, round(im.width*scale)), max(1, round(im.height*scale)))
    # Source silhouettes are much larger than their final sizes; never upscale.
    if scale > 1:
        raise ValueError(f'{name}: source would need upsampling ({scale:.3f})')
    if size[0] > FW-4*PIXEL_RATIO or size[1] > FOOT[1]-PIXEL_RATIO:
        k = min((FW-4*PIXEL_RATIO)/size[0], (FOOT[1]-PIXEL_RATIO)/size[1])
        size = (round(size[0]*k), round(size[1]*k))
    im = im.resize(size, S)
    x, y = (FW-im.width)//2, FOOT[1]-im.height
    result = Image.new('RGBA', (FW, FH))
    result.alpha_composite(im, (x, y))
    if name in CATS:
        result = light_cat_edge(result)
    return result, {'foot': FOOT.copy(), 'head': [FOOT[0], y],
                    'label_anchor': [FOOT[0], max(0, y-4*PIXEL_RATIO)],
                    'silhouette_height': im.height}


def pack(hero, cells):
    atlas = Image.new('RGBA', (COLS*FW, math.ceil(len(cells)/COLS)*FH))
    for index, (key, image, meta) in enumerate(cells):
        x, y = (index % COLS)*FW, (index // COLS)*FH
        atlas.alpha_composite(image, (x, y))
        hero['frames'][key] = {'x': x, 'y': y, 'w': FW, 'h': FH, **meta}
    atlas.save(OUT / hero['image'], optimize=True)
    return atlas


def source_meta(file, bounds, pose, index):
    return {'source': file, 'source_bounds': bounds, 'source_pose': pose,
            'source_index': index}


def main(only=None):
    OUT.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    choice = json.loads((SRC.parent/'CHOICE.json').read_text())
    manifest = {'version': 2, 'image_format': 'RGBA PNG', 'frame_size': [FW, FH],
                'logical_frame_size': [96, 100], 'pixel_ratio': PIXEL_RATIO,
                'coordinate_system': 'frame top-left; all frame, foot, head and label coordinates are physical pixels',
                'poses': ['work', 'walk', 'stretch', 'cup'],
                'resampling': 'original source pixels → chroma key / component segmentation / defringe → one LANCZOS downsample',
                'heroes': {}}
    review = {'pixel_ratio': PIXEL_RATIO, 'frame_size': [FW, FH], 'logical_frame_size': [96, 100],
              'background_written': False, 'heroes': {}}
    if only:
        manifest = json.loads((OUT/'atlas.json').read_text())
    for name, label in NAMES.items():
        if only and name not in only:
            continue
        if name == 'mikhalych' and 'whoami' in choice:
            from update_whoami import build_whoami
            manifest['heroes'][name], review['heroes'][name] = build_whoami(choice, manifest)
            continue
        source_key = 'yarik-v3' if name == 'yarik' else name
        selected = choice.get(source_key,1)
        filename = selected if isinstance(selected,str) else f'hero-{source_key}-{selected}.png'
        sheet = Image.open(SRC/filename).convert('RGB')
        indices = [WORK.get(name, 0), 1, 2, 3]
        if name == 'asya':
            indices = [1, 1, 2, 1]
        raw = {i: extract(sheet, name, i, filename) for i in set(indices)}
        target = {'sharik':51, 'motya':65}.get(name, 72)*PIXEL_RATIO
        scale = (24*PIXEL_RATIO/raw[0][0].height if name in CATS else target/raw[1][0].height)
        hero = {'name': label, 'image': f'{name}.png', 'source': filename, 'frames': {},
                'source_size': list(sheet.size), 'source_sha256': hashlib.sha256((SRC/filename).read_bytes()).hexdigest(),
                'note': ('Asya: work and cup use step due to background contamination.' if name == 'asya' else
                         'Work uses cup pose: original furniture obscures character.' if name in WORK else '')}
        cells = []
        for key, idx in zip(manifest['poses'], indices):
            im, box = raw[idx]
            rendered, meta = cell(im, round(im.height*scale), name)
            pose = (['sit','walk','lie','sleep'] if name in CATS else ['work','walk','stretch','cup'])[idx]
            cells.append((key, rendered, {**meta, **source_meta(filename, box, pose, idx)}))
        if name not in ABSENT:
            anim_file = choice['anim'][name]
            anim_sheet = Image.open(SRC/anim_file)
            anim_raw = animation_components(anim_sheet, name, anim_file)
            source_indices = [0,1,2,3,5,6] if anim_file == 'anim-masyanya-v2-1.png' else list(range(6))
            # Work/cup scale is the scene reference. Cats' walking silhouettes
            # retain the base walking size; sitting tail cells retain base sit.
            walk_height = cells[1][2]['silhouette_height'] if name in CATS else cells[0][2]['silhouette_height']
            # One scale per source activity preserves body proportions between
            # frames. Rejected candidates remain reviewable, never animated.
            walk_scale = walk_height / float(np.median([im.height for im, _ in anim_raw[:4]]))
            activity_scale = cells[0][2]['silhouette_height'] / anim_raw[4][0].height
            for i, (im, box) in enumerate(anim_raw):
                key = f'walk_{i+1}' if i < 4 else f'{"tail" if name in CATS else "typing"}_{i-3}'
                height = round(im.height*(walk_scale if i < 4 else activity_scale))
                rendered, meta = cell(im, height, name)
                cells.append((key, rendered, {**meta, **source_meta(anim_file, box, key, source_indices[i])}))
            hero['animation_source'] = anim_file
            hero['animation_source_size'] = list(anim_sheet.size)
            hero['animation_source_sha256'] = hashlib.sha256((SRC/anim_file).read_bytes()).hexdigest()
            if anim_file == 'anim-masyanya-v2-1.png':
                hero['excluded_animation_source_indices'] = [4]
            hero['walk_cycle'] = ['walk'] if name in REJECT_WALK else [f'walk_{i}' for i in range(1,5)]
            activity = 'tail' if name in CATS else 'typing'
            hero[activity] = [f'{activity}_1', f'{activity}_2']
            hero['walk_review'] = {'status': 'fallback' if name in REJECT_WALK else 'accepted',
                                   'reason': REJECT_WALK.get(name, 'Distinct original leg/arm phases; no mirrored or synthesized frames.')}
            review['heroes'][name] = {**hero['walk_review'], 'source': anim_file,
                'source_components': [box for _, box in anim_raw],
                'walk_heights_px': [c[2]['silhouette_height'] for c in cells if c[0].startswith('walk_')],
                'work_height_px': cells[0][2]['silhouette_height'],
                'activity': activity, 'activity_frames': 2}
        else:
            hero['walk_cycle'] = ['walk']
            hero['animation_note'] = 'Not active in the scene; base poses retained only.'
        pack(hero, cells)
        manifest['heroes'][name] = hero
    (OUT/'atlas.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    from extend_cat_atlas import main as extend_cats
    extend_cats(only=only)
    from update_seated_back import main as extend_seated
    extend_seated(only=only)
    prefix = 'office15b' if only else 'office15'
    (QA/f'{prefix}-art-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2)+'\n')
    if not only:
        make_qa()


def make_qa():
    manifest = json.loads((OUT/'atlas.json').read_text())
    font = ImageFont.truetype(FONT, 16)
    # A compact atlas review at 2x logical size, including a common foot line.
    active = [n for n in NAMES if n not in ABSENT]
    for page, subset in enumerate((active[:6], active[6:])):
        board = Image.new('RGB', (12*192, len(subset)*230), '#52473f')
        for row, name in enumerate(subset):
            hero = manifest['heroes'][name]
            atlas = Image.open(OUT/hero['image']).convert('RGBA')
            keys = ['work','walk','stretch','cup']+[f'walk_{i}' for i in range(1,5)]+hero.get('typing',hero.get('tail',[]))
            if name in CATS:
                keys += ['wash','window']
            draw = ImageDraw.Draw(board)
            for col, key in enumerate(keys):
                f = hero['frames'][key]
                frame = atlas.crop((f['x'], f['y'], f['x']+FW, f['y']+FH)).resize((192,200),S)
                tile = Image.new('RGBA',(192,200),'#52473f')
                tile.alpha_composite(frame)
                board.paste(tile.convert('RGB'),(col*192,row*230+24))
                draw.line((col*192,row*230+216,col*192+191,row*230+216),fill='#82745c')
                draw.text((col*192+4,row*230+3),name+' '+key,font=font,fill='white')
        board.save(QA/f'office15-art-atlas-review-{page}.jpg',quality=95)
    # Full-resolution edge samples on light/dark/checker, proving alpha quality.
    board = Image.new('RGB',(4*FW, 2*FH),'#eee5d3')
    for i,(name,key) in enumerate([('masyanya','walk_1'),('korzhik','tail_1'),('yarik','walk_3'),('taya','typing_2')]):
        hero=manifest['heroes'][name];f=hero['frames'][key];atlas=Image.open(OUT/hero['image']).convert('RGBA')
        frame=atlas.crop((f['x'],f['y'],f['x']+FW,f['y']+FH))
        for row,color in enumerate(('#eee5d3','#302a27')):
            tile=Image.new('RGBA',(FW,FH),color);tile.alpha_composite(frame);board.paste(tile.convert('RGB'),(i*FW,row*FH))
    board.save(QA/'office15-art-alpha-edges.png')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', choices=list(NAMES), nargs='+', help='Rebuild only these heroes, preserving all other atlas bytes and metadata')
    main(only=parser.parse_args().only)
