import { hpTone } from '../../game/health';

/** The StatBar fill for an HP reading: green, amber at half or less, red at a fifth or less (and when empty). */
export function hpFill(hp: number, max: number): 'hp' | 'hp-low' | 'hp-critical' {
  const tone = hpTone(hp, max);
  return tone === 'healthy' ? 'hp' : tone === 'low' ? 'hp-low' : 'hp-critical';
}
