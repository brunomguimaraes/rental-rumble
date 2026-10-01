import type { OwnedMon } from './box.js';
import { meterView, spendMeter, type MeterRecord, type MeterRules, type MeterView } from './meter.js';
import { CREATURES_BY_ID } from './pokemon.js';
import { placeById } from './world.js';

// Travel stamina: what a trip between open places costs and which ride lowers it.
// Pure; the server re-runs it from owned rows and the client only renders its quotes.

export type TravelPlace = 'home' | 'r1';
export type TravelMode = 'walk' | 'land' | 'flyer';
export interface TravelQuote {
  to: TravelPlace;
  /** The walking cost, shown next to a discount. */
  walk: number;
  cost: number;
  mode: TravelMode;
  /** The species carrying the trainer; null on foot. */
  via: string | null;
}

export const TRAVEL_RULES: MeterRules & { walkCost: number } = {
  capacity: 12,
  refillEveryMs: 900_000,
  floor: -12,
  walkCost: 4,
};

/** Species that can carry a trainer, by national dex ID. Regional forms share their dex ID. */
export const RIDE_SPECIES: Readonly<Record<number, 'land' | 'flyer'>> = {
  77: 'land', 78: 'land', 111: 'land', 112: 'land', 128: 'land', 59: 'land', 234: 'land',
  232: 'land', 750: 'land', 673: 'land', 899: 'land',
  22: 'flyer', 18: 'flyer', 6: 'flyer', 142: 'flyer', 149: 'flyer', 227: 'flyer', 334: 'flyer',
  330: 'flyer', 373: 'flyer', 398: 'flyer', 468: 'flyer', 628: 'flyer', 663: 'flyer', 715: 'flyer', 823: 'flyer',
};

const OPEN_PLACES: readonly TravelPlace[] = ['home', 'r1'];
const MODE_RANK: Record<TravelMode, number> = { flyer: 0, land: 1, walk: 2 };

export const isTravelPlace = (v: unknown): v is TravelPlace => v === 'home' || v === 'r1';

function modeCost(mode: TravelMode, walk: number): number {
  if (mode === 'walk') return walk;
  return Math.max(1, Math.ceil(walk / (mode === 'land' ? 2 : 4)));
}

/** The cheapest way from `from` to a neighbouring open place, or null when there is no such trip. */
export function quoteTravel({ from, to, party }: { from: TravelPlace; to: TravelPlace; party: readonly OwnedMon[] }): TravelQuote | null {
  if (from === to || !OPEN_PLACES.includes(to) || !placeById(from)?.neighbours.includes(to)) return null;
  const walk = TRAVEL_RULES.walkCost;
  let best: TravelQuote = { to, walk, cost: walk, mode: 'walk', via: null };
  for (const mon of party) {
    const mode = RIDE_SPECIES[mon.dexId];
    if (!mode) continue;
    const cost = modeCost(mode, walk);
    if (cost < best.cost || (cost === best.cost && MODE_RANK[mode] < MODE_RANK[best.mode])) {
      best = { to, walk, cost, mode, via: CREATURES_BY_ID[String(mon.dexId)]?.name ?? null };
    }
  }
  return best;
}

export function travelQuotes(from: TravelPlace, party: readonly OwnedMon[]): TravelQuote[] {
  return OPEN_PLACES.flatMap((to) => quoteTravel({ from, to, party }) ?? []);
}

export const travelView = (record: MeterRecord, now: number): MeterView => meterView(record, now, TRAVEL_RULES);
export const spendTravel = (record: MeterRecord, now: number, cost: number): MeterRecord | null => spendMeter(record, now, cost, TRAVEL_RULES);
