#!/usr/bin/env python3
"""OFFICE-18b: install the selected owner-supplied whoami sheet, in isolation.

Also called by cut_ai_art so a future base rebuild cannot restore old animation
art. Keep the historic atlas key/image URL for OFFICE-18 identity compatibility.
"""
import hashlib
import json
import statistics

from PIL import Image

from cut_ai_art import SRC, OUT, QA, PIXEL_RATIO, extract, cell, pack, source_meta


def build_whoami(choice, manifest):
    filename = choice['whoami']
    sheet = Image.open(SRC/filename).convert('RGB')
    raw = [extract(sheet, 'mikhalych', i, filename) for i in range(4)]
    # Crown-to-sole of standing neighbours, excluding raised arms/props. One
    # uniform scale preserves the owner's original proportions in every pose.
    references = ['leha', 'ivanych']
    target = statistics.median(manifest['heroes'][n]['frames']['walk']['silhouette_height'] for n in references)
    source_height = statistics.median(raw[i][0].height for i in (0, 1, 3))
    scale = target/source_height
    hero = {
        'name': 'whoami', 'image': 'mikhalych.png', 'source': filename,
        'source_size': list(sheet.size),
        'source_sha256': hashlib.sha256((SRC/filename).read_bytes()).hexdigest(),
        'frames': {}, 'walk_cycle': ['walk'],
        'walk_review': {'status': 'fallback', 'reason': 'Owner-supplied four poses; no approved walk cycle. Use walk with distance-driven bob and direction-only reflection.'},
        'note': 'OFFICE-18b: four owner-supplied GPT poses; original head/body proportions retained. No legacy walk or typing frames.',
        'height_normalization': {'references': references, 'target_height_px': target,
                                 'source_height_px': source_height, 'scale': scale},
    }
    cells = []
    for index, (key, (im, box)) in enumerate(zip(('work', 'walk', 'stretch', 'cup'), raw)):
        rendered, meta = cell(im, round(im.height*scale), 'mikhalych')
        cells.append((key, rendered, {**meta, **source_meta(filename, box, key, index)}))
    pack(hero, cells)
    review = {'source': filename, 'source_size': list(sheet.size),
              'scale': scale, 'target_height_px': target,
              'height_logical': {key: meta['silhouette_height']/PIXEL_RATIO for key, _, meta in cells},
              'walk_cycle': hero['walk_cycle'], 'other_heroes_changed': False}
    return hero, review


def main():
    manifest = json.loads((OUT/'atlas.json').read_text())
    choice = json.loads((SRC.parent/'CHOICE.json').read_text())
    hero, review = build_whoami(choice, manifest)
    manifest['heroes']['mikhalych'] = hero
    (OUT/'atlas.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    QA.mkdir(exist_ok=True)
    (QA/'office18b-art-review.json').write_text(json.dumps(review, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(review, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
