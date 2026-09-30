import type { Creature, PokemonType } from '../../game/types';
import { hasForm, type OwnedDex } from '../../game/account';

/** Which collection layers a player has caught for one species. */
export type VariantMarks = { n: boolean; a: boolean; s: boolean };

export type DexTab = 'stats' | 'ability' | 'moves' | 'signs';

export const DEX_TABS: readonly { id: DexTab; label: string }[] = [
  { id: 'stats', label: 'Stats' },
  { id: 'ability', label: 'Ability' },
  { id: 'moves', label: 'Moves' },
  { id: 'signs', label: 'Signs' },
];

/** List rows revealed at a time; the full National Dex is 1,025. */
export const PAGE = 120;

/** The three layers, in pip order, with their fill on the dex's light screens. */
export const COLLECTION_LAYERS: readonly {
  key: keyof VariantMarks;
  label: string;
  fill: string;
}[] = [
  { key: 'n', label: 'Normal', fill: 'bg-current' },
  { key: 'a', label: 'Alt colour', fill: 'bg-caught-alt-ink' },
  { key: 's', label: 'Shiny', fill: 'bg-caught-shiny-ink' },
];

export function paddedDexNo(dexId: number): string {
  return String(dexId).padStart(4, '0');
}

export function marksFor(owned: OwnedDex | null, dexId: number): VariantMarks | null {
  if (!owned) return null;
  return {
    n: hasForm(owned.n, dexId),
    a: hasForm(owned.a, dexId),
    s: hasForm(owned.s, dexId),
  };
}

export function caughtAny(marks: VariantMarks): boolean {
  return marks.n || marks.a || marks.s;
}

export function baseStatTotal(c: Creature): number {
  const s = c.stats;
  return s.hp + s.atk + s.eatk + s.def + s.edef + s.spd;
}

/** Name substring or dex number ("25", "#25", "0025"), optionally one type. */
export function filterCreatures(
  all: readonly Creature[],
  query: string,
  type: PokemonType | null,
): Creature[] {
  const q = query.trim().toLowerCase();
  const qNum = q.replace(/^#/, '');
  return all.filter((c) => {
    if (type && !c.types.includes(type)) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      String(c.dexId) === qNum ||
      `#${paddedDexNo(c.dexId)}`.includes(qNum)
    );
  });
}
