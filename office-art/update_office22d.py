#!/usr/bin/env python3
"""Clone neighbouring v8 background pixels over the two painted story plants.

No inpainting or generated art: the manifest records every source rectangle.
The original background remains unchanged. Run from any working directory.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
placements = json.loads((ROOT / 'office-art/pot-placements.json').read_text())
background = Image.open(ROOT / 'public/office-bg-ai.png').convert('RGB')
for name, site in placements['sites'].items():
    x0, y0, x1, y1 = site['patch_bounds']
    patch = Image.new('RGB', (x1 - x0, y1 - y0))
    for clone in site['clones']:
        tx0, ty0, tx1, ty1 = clone['target']
        source = background.crop(clone['source'])
        width, height = tx1 - tx0, ty1 - ty0
        pixels = Image.new('RGB', (width, height))
        # Integer pixel centres make nearest-neighbour cloning reproducible
        # across Pillow/libvips versions, including exact halfway samples.
        pixels.putdata([
            source.getpixel(((2*x+1)*source.width//(2*width),
                             (2*y+1)*source.height//(2*height)))
            for y in range(height) for x in range(width)
        ])
        patch.paste(pixels, (tx0, ty0))
    patch.save(ROOT / f'public/heroes-ai/pot-patch-{name}.png', optimize=True)
    print(name, site['patch_bounds'], patch.size)
