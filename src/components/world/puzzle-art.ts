import type { PuzzleScene } from '../../game/route-actions';

export const MEADOW_ART = `${import.meta.env.BASE_URL}sprites/world/sunny-meadow-v1/meadow.webp`;

/** The square of the meadow art each scene shows, as fractions of the 1254 px image (see its 10% grid). */
export const SCENE_CROPS: Record<PuzzleScene, { x: number; y: number; side: number }> = {
  'tall-grass': { x: 0.08, y: 0.45, side: 0.45 },
  sunflowers: { x: 0, y: 0.24, side: 0.38 },
  signpost: { x: 0.12, y: 0.06, side: 0.38 },
  'hilltop-oak': { x: 0.6, y: 0, side: 0.4 },
};

type Background = { backgroundImage: string; backgroundSize: string; backgroundPosition: string };

/** A background that puts the image point `x`,`y` (fractions of the image) at the box's top-left, at `scale` box widths. */
function crop(x: number, y: number, scale: number): Background {
  // A percentage position p aligns p% of the image with p% of the box: offset = p × (box − image).
  const at = (start: number) => `${(100 * start) / (scale - 1)}%`;
  return { backgroundImage: `url(${MEADOW_ART})`, backgroundSize: `${100 * scale}%`, backgroundPosition: `${at(x * scale)} ${at(y * scale)}` };
}

/** Panel `value`'s piece of the scene: the piece of its solved place, wherever the panel sits now. */
export function panelStyle(scene: PuzzleScene, value: number, size: number): Background {
  const { x, y, side } = SCENE_CROPS[scene];
  const scale = size / side;
  const row = Math.floor((value - 1) / size);
  const col = (value - 1) % size;
  return crop(x + (col * side) / size, y + (row * side) / size, scale);
}

/** The whole scene in one box: the picture to rebuild. */
export function scenePreviewStyle(scene: PuzzleScene): Background {
  const { x, y, side } = SCENE_CROPS[scene];
  return crop(x, y, 1 / side);
}
