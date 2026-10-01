import type { StatusKind, VolatileKind } from './types.js';

const ASSET = import.meta.env?.BASE_URL ?? '/';

export const statusIconUrl = (s: Exclude<StatusKind, null>): string => `${ASSET}sprites/status/${s}.png`;
export const STATUS_LABEL: Record<Exclude<StatusKind, null>, string> = {
  burn: 'Burned',
  stun: 'Paralyzed',
  poison: 'Badly poisoned',
  sleep: 'Asleep',
  frostbite: 'Frostbitten',
};
// Volatile afflictions render their own pill alongside the primary status badge.
export const volatileIconUrl = (v: VolatileKind): string => `${ASSET}sprites/status/${v}.png`;
export const VOLATILE_LABEL: Record<VolatileKind, string> = {
  weight: 'Weighed down — Speed cut',
  blind: 'Blinded — accuracy down',
  disarm: 'Disarmed — strongest move sealed',
};
