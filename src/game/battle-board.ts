import type { BattleEvent } from './battle.js';
import { asAltColor, asShiny, CREATURES_BY_ID } from './pokemon.js';
import { effectivenessLabel } from './typechart.js';
import type { Creature, PokemonType, Side, Sign, StatusKind, VolatileKind } from './types.js';
import type { WildView } from './wilds.js';

// The battle screen's state, folded from the server's event log. Pure: the
// screen replays events 0..upTo through it, so Skip is a jump to the end.

/** What the screen draws for one Pokémon on the field. */
export interface CombatantView {
  dexId: number;
  name: string;
  types: PokemonType[];
  /** Null when the server did not send it (events stored before the foe's sign was public). */
  sign: Sign | null;
  shiny: boolean;
  altColor: boolean;
  /** Cosmetic ball id for the send-out toss. */
  ball: string;
  /** Front and back battle sprites, the fallback when a species has no PMD sheet. */
  sprite: string;
  back: string;
}

export interface SideBoard {
  /** Null until the side's first send-out. */
  view: CombatantView | null;
  index: number;
  hp: number;
  maxHp: number;
  status: StatusKind;
  volatiles: VolatileKind[];
  faints: number;
  /** True from this side's faint event until its next send-out (the killing hit alone does not set it). */
  fainted: boolean;
  /** Event index of the side's latest send-out, -1 before the first; keys the spawn effects. */
  spawnAt: number;
}

export interface Board {
  player: SideBoard;
  foe: SideBoard;
  line: string;
  banner: string;
  bannerType: PokemonType | null;
}

export interface Narration {
  foeName: string;
  guardian: boolean;
  trainerName?: string;
}

export function combatantFromCreature(c: Creature, sign: Sign | null = c.sign): CombatantView {
  return {
    dexId: c.dexId,
    name: c.name,
    types: c.types,
    sign,
    shiny: c.shiny,
    altColor: c.altColor,
    ball: c.pokeball,
    sprite: c.sprite,
    back: c.back,
  };
}

/** The foe as the client knows it: the public view, never the server's mint. */
export function wildCombatant(view: WildView): CombatantView | null {
  const base = CREATURES_BY_ID[String(view.dexId)];
  if (!base) return null;
  const c = view.shiny ? asShiny(base) : view.altColor ? asAltColor(base) : base;
  return combatantFromCreature(c, view.sign ?? null);
}

/** The line to show for an event, or null for a beat with nothing to say. */
function lineFor(e: BattleEvent, n: Narration): string | null {
  const prefix = n.trainerName ? `${n.trainerName}’s ` : n.guardian ? 'The guardian ' : 'The wild ';
  switch (e.kind) {
    case 'sendout':
      if (e.affected === 'foe') {
        const name = e.name ?? n.foeName;
        if (n.trainerName) return `${n.trainerName} sends out ${name}!`;
        return n.guardian ? `The guardian ${name} appears!` : `A wild ${name} appeared!`;
      }
      return e.text || null;
    case 'hit':
      if (e.crit) return 'A critical hit!';
      if (e.mult !== undefined && e.mult > 1) return 'It’s super effective!';
      if (e.mult !== undefined && e.mult > 0 && e.mult < 1) return 'It’s not very effective…';
      return null;
    case 'faint':
      return e.affected === 'foe' ? (e.text || '').replace(/^Foe /, prefix) : e.text || null;
    case 'end':
      return e.winner === 'player' ? 'You won the battle!' : 'Your party was defeated.';
    default:
      return e.text ? e.text.replace(/^Foe /, prefix) : null;
  }
}

const emptySide = (): SideBoard => ({
  view: null, index: 0, hp: 0, maxHp: 1, status: null, volatiles: [], faints: 0, fainted: false, spawnAt: -1,
});

/** Replay the log up to `upTo` (inclusive) into what the screen shows. */
export function boardAt({ events, upTo, player, foe, narration }: {
  events: readonly BattleEvent[];
  upTo: number;
  player: readonly CombatantView[];
  foe: readonly CombatantView[];
  narration: Narration;
}): Board {
  const sides: Record<Side, SideBoard> = { player: emptySide(), foe: emptySide() };
  const teams: Record<Side, readonly CombatantView[]> = { player, foe };
  const board: Board = { player: sides.player, foe: sides.foe, line: '', banner: '', bannerType: null };
  for (let i = 0; i <= upTo && i < events.length; i++) {
    const e = events[i];
    const s = e.affected ? sides[e.affected] : null;
    if (e.kind === 'sendout' && e.affected && s) {
      const next = typeof e.index === 'number' ? teams[e.affected][e.index] : undefined;
      if (next && typeof e.index === 'number') {
        s.view = next;
        s.index = e.index;
      }
      s.status = null;
      s.volatiles = [];
      s.fainted = false;
      s.spawnAt = i;
    } else if (s && e.status !== undefined) {
      s.status = e.status ?? null;
    }
    if (s && typeof e.hp === 'number' && typeof e.maxHp === 'number') {
      s.hp = e.hp;
      s.maxHp = e.maxHp;
    }
    if (s && e.volatile) {
      const vol = e.volatile;
      if (e.volatileOn && !s.volatiles.includes(vol)) s.volatiles = [...s.volatiles, vol];
      if (!e.volatileOn) s.volatiles = s.volatiles.filter((v) => v !== vol);
    }
    if (e.kind === 'transform' && e.actor && e.transform) {
      const a = sides[e.actor];
      const t = e.transform;
      if (a.view) a.view = { ...a.view, dexId: t.dexId, name: t.name, types: t.types, sign: t.sign, sprite: t.sprite, back: t.back };
    }
    if (e.kind === 'faint' && s) {
      s.hp = 0;
      s.faints += 1;
      s.fainted = true;
    }
    if (e.kind === 'move') {
      board.banner = '';
      board.bannerType = null;
    }
    if (e.kind === 'hit' && e.mult) {
      const label = effectivenessLabel(e.mult);
      if (label) {
        board.banner = label;
        board.bannerType = e.moveType ?? null;
      }
    }
    if (e.kind === 'noeffect') {
      board.banner = 'It had no effect…';
      board.bannerType = e.moveType ?? null;
    }
    const line = lineFor(e, narration);
    if (line) board.line = line;
  }
  return board;
}
