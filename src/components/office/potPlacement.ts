import layout from '../../../office-art/layout-ai.json';
import placements from '../../../office-art/pot-placements.json';

/** Register plant feet and opaque patch rectangles in the painting's own pixels. */
export function potPlacement(id: keyof typeof placements.sites) {
  const site = placements.sites[id];
  const [left, top, width, height] = layout.background.rendered_rect;
  const [sourceWidth, sourceHeight] = layout.background.source_size;
  const sx = width / sourceWidth, sy = height / sourceHeight;
  const [x0, y0, x1, y1] = site.patch_bounds;
  return {
    place: { x: left + site.foot[0] * sx, y: top + site.foot[1] * sy },
    height: (site.plant_bounds[3] - site.plant_bounds[1]) * sy,
    patch: { x: left + x0 * sx, y: top + y0 * sy, width: (x1 - x0) * sx, height: (y1 - y0) * sy },
  };
}
