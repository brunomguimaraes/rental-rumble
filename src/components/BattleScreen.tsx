import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BattleEvent, BattleResult } from '../game/battle';
import type { Creature, Opponent, PokemonType, Role, Side } from '../game/types';
import { TYPE_COLORS, effectivenessLabel, typeIconUrl } from '../game/typechart';
import { ROLE_INFO } from '../game/roles';
import { hasPmdSprite, type PmdAnimKind } from '../game/pmd';
import { HpBar } from './HpBar';
import { TypeBadges } from './TypeBadge';
import { TrainerSprite } from './TrainerSprite';
import { PmdSprite } from './PmdSprite';

interface ActiveView {
  name: string;
  dexId: number;
  sprite: string;
  types: PokemonType[];
  role: Role;
  hp: number;
  maxHp: number;
}

interface AnimState {
  kind: PmdAnimKind;
  loop: boolean;
  token: number;
}

// Resting height (px) of the on-screen sprite; bigger attack frames overflow.
const PMD_HEIGHT = 84;

// Battle backdrop. Static for now — this is the single knob to swap when we add
// dynamic, per-biome backgrounds later.
const BATTLE_BG = `${import.meta.env.BASE_URL}sprites/backgrounds/forest.png`;

// Per-event pacing (ms). The delay is applied *before* an event is shown, so the
// gap between a 'move' (attacker lunges) and the following 'hit' (target flinches)
// is DELAY.hit — kept long enough to actually watch the attack land. Tuned slower
// than a snappy log so the animations read; the 2× toggle speeds it back up.
const DELAY: Record<BattleEvent['kind'], number> = {
  sendout: 850,
  move: 900,
  miss: 850,
  hit: 820,
  noeffect: 850,
  status: 850,
  heal: 850,
  statusTick: 800,
  stunned: 800,
  faint: 1150,
  end: 650,
};

function spriteFor(c: Creature, side: Side): string {
  return side === 'player' ? c.back : c.sprite;
}

function initialView(c: Creature, side: Side): ActiveView {
  return {
    name: c.name,
    dexId: c.dexId,
    sprite: spriteFor(c, side),
    types: c.types,
    role: c.role,
    hp: 0,
    maxHp: 1,
  };
}

const IDLE: AnimState = { kind: 'idle', loop: true, token: 0 };

interface HitFx {
  side: Side;
  amount: number;
  crit: boolean;
  key: number;
}

// The combatant: a Pokémon standing on a ground "platform", positioned in the
// arena via `posStyle`. Defined at module scope (not inside BattleScreen) so it
// keeps a stable component identity across the many per-event re-renders —
// otherwise React would remount it on every state change, replaying the
// send-out slide-in and resetting the frame animator (the "blinking" bug).
function Combatant({
  view,
  side,
  anim,
  spawn,
  shake,
  hitFx,
  speed,
  onAnimEnd,
  posStyle,
}: {
  view: ActiveView;
  side: Side;
  anim: AnimState;
  spawn: number;
  shake: Side | null;
  hitFx: HitFx | null;
  speed: number;
  onAnimEnd: (side: Side) => void;
  posStyle: CSSProperties;
}) {
  const color = TYPE_COLORS[view.types[0]];
  const pmd = hasPmdSprite(view.dexId);
  return (
    // Anchored by its bottom (the platform), so attack frames grow upward into
    // open arena space rather than shoving the ground around.
    <div
      className="absolute z-0 flex -translate-x-1/2 flex-col items-center"
      style={posStyle}
    >
      <div className="relative flex items-end justify-center">
        {hitFx && hitFx.side === side && (
          <span
            key={hitFx.key}
            className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 select-none text-xl font-black text-red-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            style={{ animation: 'floaty 0.6s ease-out' }}
          >
            -{hitFx.amount}
            {hitFx.crit ? '!' : ''}
          </span>
        )}
        {/* Keyed by spawn so the slide-in entrance replays only on a fresh
            send-out, while the PmdSprite below stays mounted between events. */}
        <div
          key={`${view.dexId}-${spawn}`}
          className={
            side === 'player' ? 'animate-sendout-player' : 'animate-sendout-foe'
          }
        >
          <div
            className={`flex items-end justify-center ${
              shake === side ? 'animate-shake' : pmd ? '' : 'animate-floaty'
            }`}
          >
            {pmd ? (
              <PmdSprite
                dexId={view.dexId}
                side={side}
                kind={anim.kind}
                playToken={anim.token}
                loop={anim.loop}
                speed={speed}
                heightPx={PMD_HEIGHT}
                onAnimEnd={() => onAnimEnd(side)}
                fallback={
                  <img
                    src={view.sprite}
                    alt={view.name}
                    className="h-20 w-20 object-contain drop-shadow-lg sm:h-28 sm:w-28"
                  />
                }
              />
            ) : (
              <img
                src={view.sprite}
                alt={view.name}
                className="h-20 w-20 object-contain drop-shadow-lg sm:h-28 sm:w-28"
              />
            )}
          </div>
        </div>
      </div>
      <div
        className="mt-0.5 h-2.5 w-16 rounded-[50%] blur-[1px] sm:w-20"
        style={{ background: `radial-gradient(closest-side, ${color}77, transparent)` }}
      />
    </div>
  );
}

// The floating status card: name, types, HP and the team's faint dots. Pinned to
// a corner of the arena (foe top-right, player bottom-left).
function InfoCard({
  view,
  side,
  faints,
  teamSize,
  className,
}: {
  view: ActiveView;
  side: Side;
  faints: number;
  teamSize: number;
  className: string;
}) {
  const alignEnd = side === 'foe';
  return (
    <div
      className={`absolute z-10 w-40 rounded-2xl border border-white/10 bg-black/55 px-3 py-2 shadow-lg backdrop-blur-sm sm:w-52 ${className}`}
    >
      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${alignEnd ? 'justify-end' : ''}`}
      >
        <span className="text-sm font-bold">{view.name}</span>
        <span
          className="text-[11px] text-white/55"
          title={ROLE_INFO[view.role].tagline}
        >
          {ROLE_INFO[view.role].glyph} {view.role}
        </span>
      </div>
      <div className={`mt-1 flex ${alignEnd ? 'justify-end' : ''}`}>
        <TypeBadges types={view.types} />
      </div>
      <div className="mt-1.5">
        <HpBar hp={view.hp} maxHp={view.maxHp} />
      </div>
      <div className={`mt-1.5 flex gap-1 ${alignEnd ? 'justify-end' : ''}`}>
        {Array.from({ length: teamSize }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${
              i < teamSize - faints ? 'bg-white/80' : 'bg-white/15'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function BattleScreen({
  opponent,
  playerTeam,
  foeTeam,
  result,
  onComplete,
}: {
  opponent: Opponent;
  playerTeam: Creature[];
  foeTeam: Creature[];
  result: BattleResult;
  onComplete: (winner: Side) => void;
}) {
  const events = result.events;

  const [player, setPlayer] = useState<ActiveView>(() =>
    initialView(playerTeam[0], 'player'),
  );
  const [foe, setFoe] = useState<ActiveView>(() =>
    initialView(foeTeam[0], 'foe'),
  );
  const [log, setLog] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [pFaints, setPFaints] = useState(0);
  const [fFaints, setFFaints] = useState(0);
  const [shake, setShake] = useState<Side | null>(null);
  const [banner, setBanner] = useState('');
  const [bannerType, setBannerType] = useState<PokemonType | null>(null);
  const [hitFx, setHitFx] = useState<HitFx | null>(null);
  const [speed, setSpeed] = useState(1);
  const [finished, setFinished] = useState(false);
  const [pAnim, setPAnim] = useState<AnimState>(IDLE);
  const [fAnim, setFAnim] = useState<AnimState>(IDLE);
  const [pSpawn, setPSpawn] = useState(0);
  const [fSpawn, setFSpawn] = useState(0);
  const fxKey = useRef(0);
  const animTok = useRef(0);

  const play = (side: Side, kind: PmdAnimKind, loop = false) => {
    animTok.current += 1;
    const next: AnimState = { kind, loop, token: animTok.current };
    (side === 'player' ? setPAnim : setFAnim)(next);
  };
  // One-shot anims (attack/hurt/walk) report completion and settle back to idle.
  const toIdle = (side: Side) => {
    animTok.current += 1;
    const next: AnimState = { ...IDLE, token: animTok.current };
    (side === 'player' ? setPAnim : setFAnim)(next);
  };

  const processEvent = (e: BattleEvent, animate: boolean) => {
    if (e.affected && e.hp !== undefined && e.maxHp !== undefined) {
      const setter = e.affected === 'player' ? setPlayer : setFoe;
      setter((v) => ({ ...v, hp: e.hp!, maxHp: e.maxHp! }));
    }
    if (e.kind === 'move') {
      setBanner('');
      setBannerType(null);
      // Play the animation that matches the move (claw, beam, slam, …), falling
      // back to the generic lunge when a move carries no style.
      if (animate && e.actor) play(e.actor, e.moveAnim ?? 'attack');
    }
    switch (e.kind) {
      case 'sendout': {
        const setter = e.affected === 'player' ? setPlayer : setFoe;
        const team = e.affected === 'player' ? playerTeam : foeTeam;
        const c = team[e.index!];
        setter({
          name: c.name,
          dexId: c.dexId,
          sprite: spriteFor(c, e.affected!),
          types: c.types,
          role: c.role,
          hp: e.hp ?? 1,
          maxHp: e.maxHp ?? 1,
        });
        if (animate && e.affected) {
          (e.affected === 'player' ? setPSpawn : setFSpawn)((n) => n + 1);
          play(e.affected, 'walk');
        } else {
          (e.affected === 'player' ? setPAnim : setFAnim)(IDLE);
        }
        break;
      }
      case 'hit': {
        if (animate && e.affected) {
          setShake(e.affected);
          window.setTimeout(() => setShake(null), 380);
          play(e.affected, 'hurt');
          fxKey.current += 1;
          setHitFx({
            side: e.affected,
            amount: e.damage ?? 0,
            crit: Boolean(e.crit),
            key: fxKey.current,
          });
        }
        const label = e.mult ? effectivenessLabel(e.mult) : '';
        if (label) {
          setBanner(label);
          setBannerType(e.moveType ?? null);
        }
        break;
      }
      case 'noeffect':
        setBanner('It had no effect…');
        setBannerType(e.moveType ?? null);
        break;
      case 'faint':
        if (e.affected === 'player') setPFaints((n) => n + 1);
        else setFFaints((n) => n + 1);
        if (animate && e.affected) play(e.affected, 'faint', true);
        break;
      case 'end':
        setFinished(true);
        break;
    }
    if (e.text) setLog((l) => [...l.slice(-40), e.text]);
  };

  useEffect(() => {
    if (finished || idx >= events.length) return;
    const e = events[idx];
    const t = window.setTimeout(() => {
      processEvent(e, true);
      setIdx((i) => i + 1);
    }, DELAY[e.kind] / speed);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, finished, speed]);

  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => onComplete(result.winner), 1100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const skip = () => {
    for (let i = idx; i < events.length; i++) processEvent(events[i], false);
    setIdx(events.length);
    setFinished(true);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TrainerSprite
            opponent={opponent}
            animated
            className="h-11 w-11 shrink-0 sm:h-12 sm:w-12"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-none">
              {opponent.name}
            </div>
            <div className="truncate text-[11px] text-white/45">
              {opponent.title}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold transition hover:bg-white/10"
          >
            {speed}× speed
          </button>
          {!finished && (
            <button
              type="button"
              onClick={skip}
              className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold transition hover:bg-white/10"
            >
              Skip ⏭
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-4 min-h-[360px] flex-1 overflow-hidden rounded-3xl border border-white/10">
        {/* Battle backdrop (pixel-art, kept crisp) + a subtle darkening pass so
            sprites and cards stay readable over any background. */}
        <div
          className="absolute inset-0 bg-cover bg-center [image-rendering:pixelated]"
          style={{ backgroundImage: `url(${BATTLE_BG})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/40" />

        {/* Both Pokémon meet in the middle, facing each other diagonally. */}
        <Combatant
          view={foe}
          side="foe"
          anim={fAnim}
          spawn={fSpawn}
          shake={shake}
          hitFx={hitFx}
          speed={speed}
          onAnimEnd={toIdle}
          posStyle={{ left: '60%', bottom: '46%' }}
        />
        <Combatant
          view={player}
          side="player"
          anim={pAnim}
          spawn={pSpawn}
          shake={shake}
          hitFx={hitFx}
          speed={speed}
          onAnimEnd={toIdle}
          posStyle={{ left: '40%', bottom: '12%' }}
        />

        {banner && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-4 py-1.5 text-sm font-bold text-amber-300 backdrop-blur">
              {bannerType && (
                <img
                  src={typeIconUrl(bannerType)}
                  alt=""
                  className="h-4 w-4 shrink-0 object-contain"
                />
              )}
              {banner}
            </span>
          </div>
        )}

        {/* Status cards in opposite corners. */}
        <InfoCard
          view={foe}
          side="foe"
          faints={fFaints}
          teamSize={foeTeam.length}
          className="right-2 top-2 sm:right-3 sm:top-3"
        />
        <InfoCard
          view={player}
          side="player"
          faints={pFaints}
          teamSize={playerTeam.length}
          className="bottom-2 left-2 sm:bottom-3 sm:left-3"
        />
      </div>

      <div className="mt-4 h-28 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3">
        <div className="flex h-full flex-col justify-end gap-0.5 text-sm">
          {log.slice(-4).map((line, i, arr) => (
            <div
              key={`${idx}-${i}`}
              className={i === arr.length - 1 ? 'text-white' : 'text-white/40'}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
