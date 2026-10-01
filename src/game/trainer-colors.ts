/** Small material palettes, shared by the picker, renderer and API validator. */
export const SKIN_TONES = [
  { id: 'porcelain', label: 'Porcelain', color: '#f5d5bf' },
  { id: 'peach', label: 'Peach', color: '#eab795' },
  { id: 'golden', label: 'Golden', color: '#d8a16e' },
  { id: 'tan', label: 'Tan', color: '#be8559' },
  { id: 'umber', label: 'Umber', color: '#9b6547' },
  { id: 'brown', label: 'Brown', color: '#7b4d38' },
  { id: 'deep', label: 'Deep brown', color: '#593727' },
  { id: 'ebony', label: 'Ebony', color: '#3c291f' },
] as const;

export const HAIR_COLORS = [
  { id: 'black', label: 'Black', color: '#292b36' },
  { id: 'espresso', label: 'Espresso', color: '#49362f' },
  { id: 'chestnut', label: 'Chestnut', color: '#80513a' },
  { id: 'copper', label: 'Copper', color: '#b96637' },
  { id: 'blonde', label: 'Blonde', color: '#e0bb77' },
  { id: 'silver', label: 'Silver', color: '#ced2de' },
  { id: 'rose', label: 'Rose', color: '#d884a2' },
  { id: 'lilac', label: 'Lilac', color: '#ad91ce' },
  { id: 'blue', label: 'Blue', color: '#668cce' },
  { id: 'teal', label: 'Teal', color: '#4d9b95' },
  { id: 'green', label: 'Green', color: '#81985d' },
  { id: 'red', label: 'Red', color: '#b34748' },
] as const;

export type SkinToneId = 'original' | (typeof SKIN_TONES)[number]['id'];
export type HairColorId = 'original' | (typeof HAIR_COLORS)[number]['id'];
export interface TrainerColors { skinTone: SkinToneId; hairColor: HairColorId }
export const ORIGINAL_COLORS: TrainerColors = { skinTone: 'original', hairColor: 'original' };

/** Missing colors mean original art; invalid supplied values are rejected. */
export function parseTrainerColors(raw: unknown): TrainerColors | null {
  if (raw === undefined || raw === null) return { ...ORIGINAL_COLORS };
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { skinTone, hairColor } = raw as Record<string, unknown>;
  if (skinTone !== 'original' && !SKIN_TONES.some((tone) => tone.id === skinTone)) return null;
  if (hairColor !== 'original' && !HAIR_COLORS.some((color) => color.id === hairColor)) return null;
  return { skinTone, hairColor } as TrainerColors;
}

/**
 * Indexed material map: red=skin, green=hair; each channel stores the
 * source-relative shade (128 is the middle tone). All other pixels stay exact.
 */
export function recolorTrainerPixels(source: Uint8ClampedArray, mask: Uint8ClampedArray, colors: TrainerColors): Uint8ClampedArray {
  const output = source.slice();
  const skin = SKIN_TONES.find((tone) => tone.id === colors.skinTone)?.color;
  const hair = HAIR_COLORS.find((color) => color.id === colors.hairColor)?.color;
  const rgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const skinRgb = skin ? rgb(skin) : null;
  const hairRgb = hair ? rgb(hair) : null;
  for (let i = 0; i < source.length; i += 4) {
    if (!source[i + 3] || !mask[i + 3]) continue;
    const target = mask[i] ? skinRgb : mask[i + 1] ? hairRgb : null;
    if (!target) continue;
    const shade = mask[i] || mask[i + 1];
    // Retain contrast for both black→blonde and light→dark choices.
    const relative = (shade - 128) / 127;
    for (let c = 0; c < 3; c++) {
      output[i + c] = Math.round(relative < 0
        ? target[c] * (1 + relative * 0.8)
        : target[c] + (255 - target[c]) * relative * 0.65);
    }
  }
  return output;
}
