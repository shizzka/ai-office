#!/usr/bin/env python3
"""Slice supplied OFFICE-23 sheets; append cells without altering earlier frames.

Run from any directory. Original source sheets are never written. All atlas
coordinates retain the existing 6 physical pixels per logical pixel contract.
"""
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw
from cut_ai_art import SRC, OUT, QA, FW, FH, FOOT, PIXEL_RATIO, S, chroma_mask, rgba_component

OWNER_KEYS = ['owner_breaker', 'owner_clap', 'owner_point', 'owner_pizza',
              'owner_eat', 'owner_peek', 'owner_skeptic', 'owner_shrug']
CHAIR_KEYS = ['chair_walk_1', 'chair_walk_2', 'chair_place', 'chair_rest']
# Reviewed clear magenta gaps. These are not blind grid cuts: hands, boxes,
# chair wheels, clap rays and the rest pose's detached breath are retained.
OWNER_BOXES = [(0, 0, 530, 422), (530, 0, 940, 422),
               (940, 0, 1400, 422), (1400, 0, 1916, 422),
               (0, 422, 530, 821), (530, 422, 970, 821),
               (970, 422, 1390, 821), (1390, 422, 1916, 821)]
CHAIR_BOXES = [(0, 0, 480, 821), (480, 0, 950, 821),
               (950, 0, 1510, 821), (1510, 0, 1916, 821)]
# Anatomical anchors in original sheet pixels. Chair wheels and effects must
# not move the human's foot baseline or change the scale of their head/body.
OWNER_FEET = [(331, 413), (737, 414), (1188, 414), (1602, 414),
              (290, 803), (733, 802), (1178, 803), (1618, 804)]
OWNER_HEADS = [(366, 31), (710, 31), (1201, 31), (1592, 31),
               (324, 431), (797, 448), (1151, 430), (1588, 430)]
CHAIR_FEET = [(159, 712), (633, 718), (1150, 700), (1721, 708)]
CHAIR_HEADS = [(239, 117), (680, 117), (1236, 152), (1669, 108)]


def digest(im):
    return hashlib.sha256(im.tobytes()).hexdigest()


def regions(filename, boxes):
    rgb = Image.open(SRC / filename).convert('RGB')
    mask = chroma_mask(rgb, 'office23', 'scene')
    source_mask = mask.copy()
    a = np.asarray(rgb).astype(np.int16)
    # No magenta wardrobe in these three reviewed sheets; key islands between
    # fingers, chair spokes and pizza drips as well as the outside background.
    mask &= ~((a[:, :, 0] > 130) & (a[:, :, 2] > 120)
              & (np.minimum(a[:, :, 0], a[:, :, 2]) - a[:, :, 1] > 70))
    result = []
    for x0, y0, x1, y1 in boxes:
        local = source_mask[y0:y1, x0:x1]
        ys, xs = np.where(local)
        bounds = [x0 + int(xs.min()), y0 + int(ys.min()),
                  x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1]
        result.append((rgba_component(rgb, mask.astype(np.int32), 1, bounds,
                                      defringe_radius=4, spill_tolerance=0), bounds))
    return result


def render(raw, bounds, foot, head, scale):
    size = (round(raw.width * scale), round(raw.height * scale))
    x = round(FOOT[0] - (foot[0] - bounds[0]) * scale)
    y = round(FOOT[1] - (foot[1] - bounds[1]) * scale)
    assert x > 1 and y > 1 and x + size[0] < FW - 1 and y + size[1] < FH - 1
    im = Image.new('RGBA', (FW, FH))
    im.alpha_composite(raw.resize(size, S), (x, y))
    hy = round(FOOT[1] - (foot[1] - head[1]) * scale)
    hx = round(FOOT[0] + (head[0] - foot[0]) * scale)
    return im, dict(foot=FOOT.copy(), head=[hx, hy],
                    label_anchor=[FOOT[0], max(0, hy - 24)],
                    silhouette_height=size[1])


def main():
    manifest = json.loads((OUT / 'atlas.json').read_text())
    QA.mkdir(exist_ok=True)
    report = {'heroes': {}, 'props': {}}
    board = Image.new('RGBA', (8 * 288, 2 * 326), '#51483e')
    draw = ImageDraw.Draw(board)
    specs = [('owner', 'owner-features.png', OWNER_KEYS, OWNER_BOXES, OWNER_FEET, OWNER_HEADS, 7),
             ('ivanych', 'ivanych-chair.png', CHAIR_KEYS, CHAIR_BOXES, CHAIR_FEET, CHAIR_HEADS, 3)]
    for row, (name, source, keys, boxes, feet, heads, reference) in enumerate(specs):
        hero = manifest['heroes'][name]
        raw = regions(source, boxes)
        target = hero['frames']['work']['silhouette_height']
        scale = target / (feet[reference][1] - heads[reference][1])
        old = Image.open(OUT / hero['image']).convert('RGBA')
        previous = {k: f for k, f in hero['frames'].items() if k not in keys}
        start = math.ceil(max(f['y'] + f['h'] for f in previous.values()) / FH)
        atlas = Image.new('RGBA', (old.width, (start + math.ceil(len(keys) / 6)) * FH))
        atlas.paste(old.crop((0, 0, old.width, start * FH)), (0, 0))
        hashes = {k: digest(old.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])))
                  for k, f in previous.items()}
        for i, (key, (im, bounds)) in enumerate(zip(keys, raw)):
            frame, meta = render(im, bounds, feet[i], heads[i], scale)
            if key == 'chair_place':
                # Original chair wheels sit below the character's shoe soles.
                # Keep the anatomical anchor and record the prop's true ground.
                meta['ground_extent'] = frame.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()[3]
            x, y = i % 6 * FW, (start + i // 6) * FH
            atlas.paste(frame, (x, y))
            hero['frames'][key] = dict(x=x, y=y, w=FW, h=FH, **meta,
                source=source, source_index=i, source_pose=key, source_bounds=bounds,
                source_scale=scale, source_foot=list(feet[i]), source_head=list(heads[i]))
            tile = Image.new('RGBA', (288, 300), '#51483e')
            tile.alpha_composite(frame.resize((288, 300), S))
            board.alpha_composite(tile, (i * 288, row * 326 + 26))
            draw.text((i * 288 + 6, row * 326 + 6), key, fill='white')
            draw.line((i * 288, row * 326 + 314, (i + 1) * 288 - 1, row * 326 + 314), fill='#a18e73')
        assert all(hashes[k] == digest(atlas.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])))
                   for k, f in previous.items())
        atlas.save(OUT / hero['image'], optimize=True)
        metadata = dict(source=source, source_sha256=hashlib.sha256((SRC / source).read_bytes()).hexdigest(),
                        frames=keys, reference_pose=keys[reference], body_height=target,
                        source_scale=scale, previous_frame_hashes=hashes)
        hero['office23_art'] = metadata
        report['heroes'][name] = metadata
    props = regions('props-pizza.png', [(0, 0, 535, 821), (535, 0, 1040, 821),
                                       (1040, 0, 1350, 821), (1350, 0, 1916, 821)])
    # Match carried box width (not the open lid height) to owner_pizza's box.
    # Supplied prop box is 430 source px wide; carried box is 234 source px.
    prop_scale = manifest['heroes']['owner']['office23_art']['source_scale'] * 234 / 430
    for key, (im, bounds) in zip(('closed', 'open', 'slice', 'last'), props):
        im = im.resize((round(im.width * prop_scale), round(im.height * prop_scale)), S)
        pad = 8
        result = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad))
        result.alpha_composite(im, (pad, pad))
        filename = f'pizza-{key}.png'
        result.save(OUT / filename, optimize=True)
        report['props'][key] = dict(image=filename, w=result.width, h=result.height,
            pixel_ratio=PIXEL_RATIO, anchor=[result.width // 2, result.height - pad],
            padding=pad, source='props-pizza.png', source_bounds=bounds, source_scale=prop_scale)
    manifest['pizza_props'] = report['props']
    (OUT / 'atlas.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    board.convert('RGB').save(QA / 'office23-art-scenes.jpg', quality=96)
    (QA / 'office23-art-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('OFFICE-23: 8 owner frames, 4 chair frames, 4 pizza props; previous frames pixel-identical.')


if __name__ == '__main__':
    main()
