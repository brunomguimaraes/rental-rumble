import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { partyCreatures } from '../../game/activity';
import type { BattleEvent } from '../../game/battle';
import { boardAt, combatantFromCreature, wildCombatant, type SideBoard } from '../../game/battle-board';
import { STATUS_LABEL, VOLATILE_LABEL, statusIconUrl, volatileIconUrl } from '../../game/battle-labels';
import type { OwnedMon } from '../../game/box';
import { ballUrl } from '../../game/balls';
import { hasPmdSprite, PMD_SCALE, pmdBody, type PmdAnimKind } from '../../game/pmd';
import { TYPE_COLORS } from '../../game/typechart';
import type { Side } from '../../game/types';
import type { WildView } from '../../game/wilds';
import { signIconUrl, signLabel } from '../../game/zodiac';
import { PmdSprite } from '../PmdSprite';
import { TypeBadges } from '../TypeBadge';
import { PixelSprite } from '../ui/PixelSprite';
import { StatBar } from '../ui/StatBar';
import { Backdrop } from './Backdrop';
import { BATTLE_SHADOW, POKEBALL, speciesName } from './scene';

// Plays the server's event log with the old Rental Rumble choreography. It
// never simulates: the server decided the battle and sent what happened. The
// board comes from boardAt; animations come only from the current event.

// Pause before showing each kind of event (ms), tuned so attacks read.
const DELAY: Record<BattleEvent['kind'], number> = {
  sendout: 450,
  withdraw: 700,
  move: 900,
  miss: 850,
  hit: 820,
  noeffect: 850,
  status: 850,
  stat: 800,
  heal: 850,
  statusTick: 800,
  stunned: 800,
  ability: 900,
  transform: 950,
  faint: 1150,
  end: 650,
};
// The arena is `h-64`. Each combatant stands on a zero-size ground anchor, the
// centre of its resting shadow; the horizontal spots sit about where the old
// screen centred a body, held far enough from the edge that the widest resting
// body (about 100px either side of its ground at 2x: Eternatus, Guzzlord) stays
// inside even at phone width. The foe stands a little above the old 38% so a
// dual-type player card (taller at 320px) leaves its feet visible, while the
// tallest resting foe body (130px above its ground at 2x, Rayquaza) still clears
// the arena's top. The player's ground sits high enough that the lowest-hanging
// resting body (34px below its ground at 2x, Guzzlord) stays inside the bottom.
const ARENA_PX = 256;
const ANCHOR: Record<Side, { x: CSSProperties; bottom: number }> = {
  foe: { x: { right: 'max(calc(14% + 48px), 104px)' }, bottom: 112 },
  player: { x: { left: 'max(calc(10% + 48px), 104px)' }, bottom: 36 },
};
// The flat fallback sprite (no PMD sheet) and the height its pop clears.
const FALLBACK_PX = 96;
// The medium PMD shadow under a flat sprite, at 2x its 14x6 art.
const FALLBACK_SHADOW = { width: 28, height: 12 };
// Damage pop: gap above the body's top, its upward drift (damage-pop in
// index.css), its tallest text line and the margin it keeps inside the arena.
const POP_GAP_PX = 6;
const POP_RISE_PX = 26;
const POP_TEXT_PX = 16;
const POP_EDGE_PX = 4;
// HP fill on send-out: it starts once the card has faded in (card-in in
// index.css: 0.42s delay + 0.4s) and lights one StatBar segment per tick.
const FILL_DELAY_MS = 820;
const FILL_TICKS = 12;
const FILL_TICK_MS = 40;

/** Height above the ground anchor for a damage pop, clamped inside the arena. */
function popLift(side: Side, bodyPx: number): number {
  const highest = ARENA_PX - ANCHOR[side].bottom - POP_RISE_PX - POP_TEXT_PX - POP_EDGE_PX;
  return Math.min(bodyPx + POP_GAP_PX, highest);
}

interface Anim {
  kind: PmdAnimKind;
  loop: boolean;
  token: number;
}

/** What a side is doing on the current beat. One-shots settle to idle once they end. */
function animFor({ side, board, event, at, settled, live }: {
  side: Side; board: SideBoard; event: BattleEvent | undefined; at: number; settled: number; live: boolean;
}): Anim {
  if (board.fainted) return { kind: 'faint', loop: true, token: -2 };
  if (live && event && settled !== at) {
    if (event.kind === 'move' && event.actor === side) return { kind: event.moveAnim ?? 'attack', loop: false, token: at };
    if (event.kind === 'hit' && event.affected === side) return { kind: 'hurt', loop: false, token: at };
  }
  return { kind: 'idle', loop: true, token: -1 };
}

// Children of the zero-size ground anchor get explicit widths: preflight's
// `img { max-width: 100% }` would otherwise shrink their images to nothing.
function BallFx({ side, ball }: { side: Side; ball: string }) {
  return (
    <div className="pointer-events-none absolute -left-3 bottom-6 z-20 w-6">
      <span className="animate-ball-burst burst-star absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 bg-ink" />
      <img
        src={ballUrl(ball)}
        alt=""
        className={`relative h-6 w-6 object-contain [image-rendering:pixelated] ${side === 'player' ? 'animate-ball-toss-player' : 'animate-ball-toss-foe'}`}
      />
    </div>
  );
}

/** A sprite with no PMD sheet: the shadow centres on the anchor and the shake moves only the sprite. */
function FlatSprite({ src, shakeClass, shakeKey }: { src: string; shakeClass: string; shakeKey: number }) {
  return (
    <>
      <img
        src={BATTLE_SHADOW}
        alt=""
        className="pointer-events-none absolute left-0 top-0 max-w-none -translate-x-1/2 -translate-y-1/2 opacity-60 [image-rendering:pixelated]"
        style={{ width: FALLBACK_SHADOW.width, height: FALLBACK_SHADOW.height }}
      />
      <div key={`shake-${shakeKey}`} className={shakeClass}>
        <div className="absolute bottom-0 left-0 -translate-x-1/2" style={{ width: FALLBACK_PX }}>
          <PixelSprite src={src} fallback={POKEBALL} size={FALLBACK_PX} alt="" />
        </div>
      </div>
    </>
  );
}

// Module scope so it keeps its identity across beats: the PMD frame animator
// stays mounted between events and only remounts on a fresh send-out.
function Combatant({ side, board, anim, live, hit, shake, shakeKey, onAnimEnd }: {
  side: Side;
  board: SideBoard;
  anim: Anim;
  /** Play spawn effects (false after Skip and under reduced motion). */
  live: boolean;
  hit: { amount: number; crit: boolean; key: number } | null;
  shake: boolean;
  /** Index of the latest hit on this side; changes only on a new hit, so the shake restarts per hit. */
  shakeKey: number;
  onAnimEnd: (side: Side) => void;
}) {
  const view = board.view;
  if (!view) return null;
  const pmd = hasPmdSprite(view.dexId);
  const body = pmd ? pmdBody(view.dexId) : null;
  const bodyPx = body ? body.top * PMD_SCALE : FALLBACK_PX;
  const shakeClass = shake ? 'animate-shake' : '';
  const fallback = <FlatSprite src={side === 'player' ? view.back : view.sprite} shakeClass={shakeClass} shakeKey={shakeKey} />;
  // The root is a zero-size ground anchor: the resting shadow centres on it and
  // the wrappers' transforms (materialize, then the body-only shake) move the
  // absolutely placed shadow and sprite around it.
  return (
    <div className="absolute h-0 w-0" style={{ ...ANCHOR[side].x, bottom: ANCHOR[side].bottom }}>
      {hit && (
        <span
          key={hit.key}
          className={`dmg-number animate-damage-pop pointer-events-none absolute left-0 z-30 whitespace-nowrap leading-none ${hit.crit ? 'text-sm' : 'text-xs'}`}
          style={{ bottom: popLift(side, bodyPx) }}
        >
          -{hit.amount}
          {hit.crit && <span className="ml-1 font-label text-[8px] uppercase text-accent">Crit</span>}
        </span>
      )}
      {live && <BallFx key={`ball-${board.spawnAt}`} side={side} ball={view.ball} />}
      <div key={`${view.dexId}-${board.spawnAt}`} className={live ? 'animate-materialize' : ''}>
        {/* The shadow forms with the Pokémon; the shake moves only the body. */}
        {pmd ? (
          <PmdSprite
            dexId={view.dexId}
            side={side}
            kind={anim.kind}
            loop={anim.loop}
            playToken={anim.token}
            shiny={view.shiny}
            altColor={view.altColor}
            onAnimEnd={() => onAnimEnd(side)}
            fallback={fallback}
            bodyClassName={shakeClass}
            bodyKey={`shake-${shakeKey}`}
          />
        ) : (
          fallback
        )}
      </div>
    </div>
  );
}

/**
 * The HP a side's card draws: after a send-out it counts up from 0 one StatBar
 * segment per tick, starting once the card is opaque, and never passes the
 * board's HP. The card is keyed by the side's `spawnAt`, so each send-out mounts
 * a fresh fill that runs on across later beats. Skip and reduced motion (`live`
 * false) show the board's HP at once.
 */
function useHpFill({ spawnAt, hp, maxHp, live }: { spawnAt: number; hp: number; maxHp: number; live: boolean }): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!live || spawnAt < 0) return;
    let ticks = 0;
    let timer = 0;
    const tick = () => {
      ticks += 1;
      setStep(ticks);
      if (ticks < FILL_TICKS) timer = window.setTimeout(tick, FILL_TICK_MS);
    };
    timer = window.setTimeout(tick, FILL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [spawnAt, live]);
  if (!live) return hp;
  return Math.min(hp, Math.floor((maxHp * step) / FILL_TICKS));
}

function InfoCard({ board, live, pips, className }: {
  board: SideBoard;
  /** Animate the card in and fill its HP (false after Skip and under reduced motion). */
  live: boolean;
  /** Party size for faint pips, or null for no pips. */
  pips: number | null;
  className: string;
}) {
  const hp = useHpFill({ spawnAt: board.spawnAt, hp: board.hp, maxHp: board.maxHp, live });
  const view = board.view;
  if (!view) return null;
  return (
    <div className={`${live ? 'animate-card-in' : ''} absolute z-10 flex w-[48%] flex-col gap-1 rounded-[3px] border-2 border-window-frame bg-window/90 px-1.5 py-1 ${className}`}>
      <div className="flex items-center gap-1 font-pixel text-xs">
        <span className="truncate">{view.name}</span>
        {view.shiny && <span role="img" className="text-caught-shiny" aria-label="Shiny">✦</span>}
        {view.sign && <img src={signIconUrl(view.sign)} alt={signLabel(view.sign)} title={signLabel(view.sign)} className="h-4 w-4 shrink-0 object-contain" />}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <TypeBadges types={view.types} />
        {board.status && (
          <img src={statusIconUrl(board.status)} alt={STATUS_LABEL[board.status]} title={STATUS_LABEL[board.status]} className="h-4 shrink-0 object-contain [image-rendering:pixelated]" />
        )}
        {board.volatiles.map((v) => (
          <img key={v} src={volatileIconUrl(v)} alt={VOLATILE_LABEL[v]} title={VOLATILE_LABEL[v]} className="h-4 shrink-0 object-contain [image-rendering:pixelated]" />
        ))}
      </div>
      <StatBar value={hp} max={board.maxHp} tone="night" label={`${view.name} HP`} segments={12} />
      <div className="flex items-center justify-between gap-1">
        <span className="font-label text-[10px] tabular-nums text-ink-dim">
          {Math.max(0, Math.ceil(hp))} / {board.maxHp}
        </span>
        {pips !== null && (
          <span role="img" className="flex gap-0.5" aria-label={`${pips - board.faints} of ${pips} able to battle`}>
            {Array.from({ length: pips }, (_, i) => (
              <span key={i} className={`h-2 w-2 ${i < pips - board.faints ? 'bg-ink' : 'border border-ink-dim'}`} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
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
  // True once Skip is used: the board jumps and no effect replays.
  const [jumped, setJumped] = useState(false);
  // The event index each side's one-shot animation finished on.
  const [settled, setSettled] = useState<Record<Side, number>>({ player: -1, foe: -1 });
  const last = events.length - 1;
  const done = at >= last;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const live = !jumped && !reduced;

  // Building creatures derives movesets; do it once per battle, not per beat.
  const rosters = useMemo(() => {
    const foeView = wildCombatant(foe);
    return {
      player: partyCreatures(party).map((c) => combatantFromCreature(c)),
      foe: foeView ? [foeView] : [],
    };
  }, [party, foe]);
  const board = boardAt({
    events,
    upTo: at,
    player: rosters.player,
    foe: rosters.foe,
    narration: { foeName: speciesName(foe.dexId), guardian: foe.guardian, trainerName },
  });
  const event = events[at];

  useEffect(() => {
    if (done || reduced) return;
    const next = events[at + 1];
    const t = window.setTimeout(() => setAt((i) => Math.min(last, i + 1)), next ? DELAY[next.kind] : DELAY.end);
    return () => window.clearTimeout(t);
  }, [at, done, events, last, reduced]);

  const hitOn = (side: Side) =>
    live && event?.kind === 'hit' && event.affected === side
      ? { amount: event.damage ?? 0, crit: Boolean(event.crit), key: at }
      : null;
  // Keys the shake wrapper: it changes only when a new hit lands on `side`, so
  // back-to-back hits restart the shake while other beats keep the sprite mounted.
  const lastHitOn = (side: Side): number => {
    for (let i = at; i >= 0; i--) {
      const e = events[i];
      if (e?.kind === 'hit' && e.affected === side) return i;
    }
    return -1;
  };
  const settle = (side: Side) => setSettled((s) => ({ ...s, [side]: at }));
  const won = events[last]?.winner === 'player';

  return (
    <section aria-label="Battle" className="ui-window m-2 p-2">
      <div className="relative h-64 overflow-hidden rounded-[3px] bg-slot">
        <Backdrop src={backdrop} anchor={0.6} />
        <InfoCard key={`foe-${board.foe.spawnAt}`} board={board.foe} live={live && board.foe.spawnAt >= 0} pips={null} className="left-2 top-2" />
        {(['foe', 'player'] as const).map((side) => (
          <Combatant
            key={side}
            side={side}
            board={board[side]}
            anim={animFor({ side, board: board[side], event, at, settled: settled[side], live })}
            live={live && board[side].spawnAt >= 0}
            hit={hitOn(side)}
            shake={hitOn(side) !== null}
            shakeKey={live ? lastHitOn(side) : -1}
            onAnimEnd={settle}
          />
        ))}
        <InfoCard key={`player-${board.player.spawnAt}`} board={board.player} live={live && board.player.spawnAt >= 0} pips={rosters.player.length} className="bottom-2 right-2" />
        {board.banner && (
          <span
            className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[3px] border-2 bg-window px-2 py-0.5 font-label text-[10px] uppercase"
            style={board.bannerType ? { borderColor: TYPE_COLORS[board.bannerType] } : undefined}
          >
            {board.banner}
          </span>
        )}
      </div>

      <p aria-live="polite" className="mt-2 min-h-12 rounded-[3px] border-2 border-window-frame bg-edge px-2 py-1.5 text-sm">
        {board.line || '…'}
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
            <button
              type="button"
              onClick={() => {
                setJumped(true);
                setAt(last);
              }}
              className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase"
            >
              Skip
            </button>
          </>
        )}
      </div>
    </section>
  );
}
