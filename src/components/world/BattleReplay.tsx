import { useEffect, useState } from 'react';
import type { BattleEvent } from '../../game/battle';
import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import type { WildView } from '../../game/wilds';
import { asAltColor, asShiny, backUrl, CREATURES_BY_ID, spriteUrl } from '../../game/pokemon';
import { PixelSprite } from '../ui/PixelSprite';
import { Backdrop } from './Backdrop';
import { StatBar } from '../ui/StatBar';
import { POKEBALL, monName, speciesName } from './scene';

// A compact battle view that plays the server's event log line by line. It
// never simulates: the server decided the battle and sent what happened.

const STEP_MS = 700;

/** The line to show for an event, or null for a beat with nothing to say. */
function lineFor(e: BattleEvent, foe: WildView, trainerName?: string): string | null {
  const prefix = trainerName ? `${trainerName}’s ` : foe.guardian ? 'The guardian ' : 'The wild ';
  switch (e.kind) {
    case 'sendout':
      if (e.affected === 'foe') {
        if (trainerName) return `${trainerName} sends out ${e.name ?? speciesName(foe.dexId)}!`;
        return foe.guardian ? `The guardian ${e.name ?? speciesName(foe.dexId)} appears!` : `A wild ${e.name ?? speciesName(foe.dexId)} appeared!`;
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

interface Board {
  foeHp: number;
  foeMax: number;
  playerIndex: number;
  playerHp: number;
  playerMax: number;
  line: string;
}

/** Replay the log up to `upTo` (inclusive) into what the screen shows. */
function boardAt({ events, upTo, foe, trainerName }: {
  events: readonly BattleEvent[]; upTo: number; foe: WildView; trainerName?: string;
}): Board {
  const b: Board = { foeHp: 1, foeMax: 1, playerIndex: 0, playerHp: 1, playerMax: 1, line: '' };
  for (let i = 0; i <= upTo && i < events.length; i++) {
    const e = events[i];
    if (e.kind === 'sendout' && e.affected === 'player' && typeof e.index === 'number') b.playerIndex = e.index;
    if (typeof e.hp === 'number' && typeof e.maxHp === 'number') {
      if (e.affected === 'foe') {
        b.foeHp = e.hp;
        b.foeMax = e.maxHp;
      } else if (e.affected === 'player') {
        b.playerHp = e.hp;
        b.playerMax = e.maxHp;
      }
    }
    if (e.kind === 'faint') {
      if (e.affected === 'foe') b.foeHp = 0;
      else b.playerHp = 0;
    }
    const line = lineFor(e, foe, trainerName);
    if (line) b.line = line;
  }
  return b;
}

export function BattleReplay({
  events,
  party,
  foe,
  backdrop,
  trainerName,
  onDone,
}: {
  events: readonly BattleEvent[];
  party: readonly OwnedMon[];
  foe: WildView;
  /** The route's scene behind the arena. */
  backdrop: string;
  trainerName?: string;
  onDone: () => void;
}) {
  const [at, setAt] = useState(0);
  const last = events.length - 1;
  const done = at >= last;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (done || reduced) return;
    // Beats with nothing to say pass quickly.
    const quiet = lineFor(events[at + 1] ?? events[at], foe, trainerName) === null;
    const t = window.setTimeout(() => setAt((i) => Math.min(last, i + 1)), quiet ? STEP_MS / 3 : STEP_MS);
    return () => window.clearTimeout(t);
  }, [at, done, events, foe, last, reduced, trainerName]);

  const b = boardAt({ events, upTo: at, foe, trainerName });
  const lead = party[b.playerIndex] ?? party[0];
  const foeBase = CREATURES_BY_ID[String(foe.dexId)];
  const foeCreature = foeBase ? foe.shiny ? asShiny(foeBase) : foe.altColor ? asAltColor(foeBase) : foeBase : null;
  const leadCreature = lead ? ownedMonToCreature(lead) : null;
  const won = events[last]?.winner === 'player';

  return (
    <section aria-label="Battle" className="ui-window m-2 p-2">
      <div className="relative h-56 overflow-hidden rounded-[3px] bg-slot">
        <Backdrop src={backdrop} anchor={0.6} />
        <div className="absolute right-2 top-2 flex w-[48%] flex-col gap-1 rounded-[3px] border-2 border-window-frame bg-window/90 px-1.5 py-1">
          <div className="flex items-center justify-between gap-1 text-xs">
            <span className="truncate">
              {speciesName(foe.dexId)}
              {foe.shiny && <span className="ml-1 text-caught-shiny">✦</span>}
            </span>
          </div>
          <StatBar value={b.foeHp} max={b.foeMax} tone="night" label={`${speciesName(foe.dexId)} HP`} segments={12} />
        </div>
        <PixelSprite src={foeCreature?.sprite ?? spriteUrl(foe.dexId)} fallback={POKEBALL} size={96} alt={speciesName(foe.dexId)} className={`absolute right-3 top-10 ${b.foeHp === 0 ? 'opacity-30' : ''}`} />

        {lead && (
          <>
            <PixelSprite
              src={leadCreature?.back ?? backUrl(lead.dexId)}
              fallback={POKEBALL}
              size={96}
              alt={monName(lead)}
              className={`absolute bottom-2 left-3 ${b.playerHp === 0 ? 'opacity-30' : ''}`}
            />
            <div className="absolute bottom-3 right-2 flex w-[48%] flex-col gap-1 rounded-[3px] border-2 border-window-frame bg-window/90 px-1.5 py-1">
              <div className="flex items-center justify-between gap-1 text-xs">
                <span className="truncate">{monName(lead)}</span>
              </div>
              <StatBar value={b.playerHp} max={b.playerMax} tone="night" label={`${monName(lead)} HP`} segments={12} />
            </div>
          </>
        )}
      </div>

      <p aria-live="polite" className="mt-2 min-h-12 rounded-[3px] border-2 border-window-frame bg-edge px-2 py-1.5 text-sm">
        {b.line || '…'}
      </p>

      <div className="mt-2 flex justify-end gap-2">
        {done ? (
          <button type="button" onClick={onDone} autoFocus className="ui-button-primary ui-focus min-h-11 px-4 font-label text-[10px] uppercase">
            {won ? 'Continue' : 'See what happened'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setAt((i) => Math.min(last, i + 1))} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
              Next
            </button>
            <button type="button" onClick={() => setAt(last)} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
              Skip
            </button>
          </>
        )}
      </div>
    </section>
  );
}
