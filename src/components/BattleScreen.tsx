import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BattleEvent, BattleResult } from '../game/battle';
import type {
  Creature,
  Opponent,
  PokemonType,
  Sign,
  Side,
  StatusKind,
} from '../game/types';
import { TYPE_COLORS, effectivenessLabel, typeIconUrl } from '../game/typechart';
import { signIconUrl, signLabel, signSummary, signTier } from '../game/zodiac';
import { hasPmdSprite, type PmdAnimKind } from '../game/pmd';
import { autoWinEnabled } from '../game/dev';
import { ballUrl } from '../game/balls';
import { backdropFor } from '../game/backgrounds';
import { HpBar } from './HpBar';
import { TypeBadges } from './TypeBadge';
import { TrainerSprite } from './TrainerSprite';
import { PmdSprite } from './PmdSprite';
import { BattleGuide } from './BattleGuide';

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ASSET = import.meta.env?.BASE_URL ?? '/';

// Battle speed is a player preference that should stick across battles and
// reloads, so it lives in localStorage rather than resetting to 1× each time.
const SPEED_KEY = 'battle-speed';
const SPEED_CYCLE = [1, 2, 4] as const;
const readStoredSpeed = (): number => {
  if (typeof window === 'undefined') return 1;
  const stored = Number(window.localStorage.getItem(SPEED_KEY));
  return SPEED_CYCLE.includes(stored as (typeof SPEED_CYCLE)[number])
    ? stored
    : 1;
};
const statusIconUrl = (s: Exclude<StatusKind, null>) =>
  `${ASSET}sprites/status/${s}.png`;
const STATUS_LABEL: Record<Exclude<StatusKind, null>, string> = {
  burn: 'Burned',
  stun: 'Paralyzed',
  poison: 'Badly poisoned',
  sleep: 'Asleep',
};

interface ActiveView {
  name: string;
  dexId: number;
  sprite: string;
  types: PokemonType[];
  sign: Sign;
  ball: string;
  hp: number;
  maxHp: number;
  status: StatusKind;
  shiny: boolean;
  altColor: boolean;
}

interface AnimState {
  kind: PmdAnimKind;
  loop: boolean;
  token: number;
}

// Resting height (px) of the on-screen sprite; bigger attack frames overflow.
const PMD_HEIGHT = 84;

// Per-event pacing (ms). The delay is applied *before* an event is shown, so the
// gap between a 'move' (attacker lunges) and the following 'hit' (target flinches)
// is DELAY.hit — kept long enough to actually watch the attack land. Tuned slower
// than a snappy log so the animations read; the 2× toggle speeds it back up.
const DELAY: Record<BattleEvent['kind'], number> = {
  sendout: 450,
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

function spriteFor(c: Creature, side: Side): string {
  return side === 'player' ? c.back : c.sprite;
}

function initialView(c: Creature, side: Side): ActiveView {
  return {
    name: c.name,
    dexId: c.dexId,
    sprite: spriteFor(c, side),
    types: c.types,
    sign: c.sign,
    ball: c.pokeball,
    hp: 0,
    maxHp: 1,
    status: null,
    shiny: c.shiny,
    altColor: c.altColor,
  };
}

const IDLE: AnimState = { kind: 'idle', loop: true, token: 0 };

interface HitFx {
  side: Side;
  amount: number;
  crit: boolean;
  key: number;
}

// The Poké Ball throw + open flash that precedes a Pokémon materialising. The
// ball arcs in from the trainer's side, spins, lands, and bursts into a white
// flash; the timing is choreographed in index.css so it lines up with the
// Pokémon's `materialize` reveal. Remounted (via a `key` on spawn) each send-out.
function BallFx({ side, ball }: { side: Side; ball: string }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
      <span
        className="animate-ball-burst absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,236,170,0.6) 40%, transparent 70%)',
        }}
      />
      <img
        src={ballUrl(ball)}
        alt=""
        className={`relative h-6 w-6 object-contain drop-shadow [image-rendering:pixelated] ${
          side === 'player' ? 'animate-ball-toss-player' : 'animate-ball-toss-foe'
        }`}
      />
    </div>
  );
}

// The combatant: a Pokémon standing on a ground "platform", positioned in the
// arena via `posStyle`. Defined at module scope (not inside BattleScreen) so it
// keeps a stable component identity across the many per-event re-renders —
// otherwise React would remount it on every state change, replaying the
// send-out animation and resetting the frame animator (the "blinking" bug).
// Renders nothing until `visible` (the Pokémon has actually been sent out), so
// the arena starts empty instead of showing a placeholder with an empty HP bar.
function Combatant({
  view,
  side,
  anim,
  spawn,
  visible,
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
  visible: boolean;
  shake: Side | null;
  hitFx: HitFx | null;
  speed: number;
  onAnimEnd: (side: Side) => void;
  posStyle: CSSProperties;
}) {
  const color = TYPE_COLORS[view.types[0]];
  const pmd = hasPmdSprite(view.dexId);
  if (!visible) return null;
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
            className={`dmg-number animate-damage-pop pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 inline-flex select-none items-start whitespace-nowrap leading-none ${
              hitFx.crit ? 'text-sm' : 'text-xs'
            }`}
          >
            -{hitFx.amount}
            {hitFx.crit && (
              <span className="ml-1 mt-0.5 text-[8px] text-amber-300">CRIT</span>
            )}
          </span>
        )}
        {/* The ball throw + open flash, replayed on each fresh send-out. */}
        {!REDUCED_MOTION && (
          <BallFx key={`ball-${spawn}`} side={side} ball={view.ball} />
        )}
        {/* Keyed by spawn so the materialize entrance replays only on a fresh
            send-out, while the PmdSprite below stays mounted between events. */}
        <div
          key={`${view.dexId}-${spawn}`}
          className={REDUCED_MOTION ? '' : 'animate-materialize'}
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
                shiny={view.shiny}
                altColor={view.altColor}
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
  faints,
  teamSize,
  alignEnd,
  visible,
  className,
}: {
  view: ActiveView;
  faints: number;
  teamSize: number;
  alignEnd: boolean;
  visible: boolean;
  className: string;
}) {
  if (!visible) return null;
  const tier = signTier(view.sign);
  const celestialClass =
    tier === 'rare' ? 'sign-rare border-transparent' : tier === 'mythic' ? 'sign-mythic border-transparent' : 'border-white/10';
  return (
    <div
      className={`animate-card-in absolute z-10 w-40 rounded-2xl border bg-black/55 px-3 py-2 shadow-lg backdrop-blur-sm sm:w-52 ${celestialClass} ${className}`}
    >
      <div
        className={`flex items-center gap-1.5 ${alignEnd ? 'flex-row-reverse' : ''}`}
      >
        <span className="truncate text-sm font-bold">{view.name}</span>
        {view.shiny && (
          <span
            title="Shiny — a rare colour variant"
            className="shiny-twinkle pointer-events-none grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] drop-shadow"
            style={{
              background: 'radial-gradient(circle, #fff6d6 0%, #ffd76b 55%, #f5a623 100%)',
              color: '#7a4b00',
            }}
          >
            ✦
          </span>
        )}
        <img
          src={signIconUrl(view.sign)}
          alt={signLabel(view.sign)}
          title={signSummary(view.sign)}
          className="h-4 w-4 shrink-0 cursor-help object-contain"
        />
      </div>
      <div
        className={`mt-1 flex items-center gap-1.5 ${
          alignEnd ? 'flex-row-reverse' : ''
        }`}
      >
        <TypeBadges types={view.types} />
        {view.status && (
          <img
            src={statusIconUrl(view.status)}
            alt={STATUS_LABEL[view.status]}
            title={STATUS_LABEL[view.status]}
            className="h-3.5 shrink-0 object-contain [image-rendering:pixelated]"
          />
        )}
      </div>
      <div className="mt-1.5">
        <HpBar hp={view.hp} maxHp={view.maxHp} compact />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tabular-nums text-white/75">
          {Math.max(0, Math.ceil(view.hp))}
          <span className="text-white/35"> / {view.maxHp}</span>
        </span>
        <div className="flex gap-1">
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

  // Resolve the backdrop once per battle (themed to the opponent + the local
  // time of day) and keep it stable across the many per-event re-renders.
  const [bg] = useState(() => backdropFor(opponent));

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
  const [speed, setSpeed] = useState(readStoredSpeed);
  const [showGuide, setShowGuide] = useState(false);
  const [finished, setFinished] = useState(false);
  const [pAnim, setPAnim] = useState<AnimState>(IDLE);
  const [fAnim, setFAnim] = useState<AnimState>(IDLE);
  const [pSpawn, setPSpawn] = useState(0);
  const [fSpawn, setFSpawn] = useState(0);
  // Neither side is on the field until its `sendout` event plays — the arena
  // starts empty rather than showing placeholders with empty HP bars.
  const [pVisible, setPVisible] = useState(false);
  const [fVisible, setFVisible] = useState(false);
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
    let logText = e.text;
    // Send-out manages its own HP (it animates the bar filling), so skip the
    // generic update for it.
    if (
      e.kind !== 'sendout' &&
      e.affected &&
      e.hp !== undefined &&
      e.maxHp !== undefined
    ) {
      const setter = e.affected === 'player' ? setPlayer : setFoe;
      setter((v) => ({ ...v, hp: e.hp!, maxHp: e.maxHp! }));
    }
    // Mirror the live main status (burn/paralysis/poison/sleep) onto the card.
    // Apply/tick events carry the kind; the engine emits `status: null` when a
    // condition clears (woke up, shook off paralysis, burn faded). Volatile
    // confusion carries no `status` field, so it leaves the badge untouched.
    if (e.affected && e.status !== undefined) {
      const setter = e.affected === 'player' ? setPlayer : setFoe;
      setter((v) => ({ ...v, status: e.status ?? null }));
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
        const side = e.affected!;
        const setter = side === 'player' ? setPlayer : setFoe;
        const team = side === 'player' ? playerTeam : foeTeam;
        const c = team[e.index!];
        const full = e.hp ?? 1;
        const maxHp = e.maxHp ?? 1;
        // The ball opens with HP at 0, then fills as the Pokémon settles in.
        const fillBar = animate && !REDUCED_MOTION;
        setter({
          name: c.name,
          dexId: c.dexId,
          sprite: spriteFor(c, side),
          types: c.types,
          sign: c.sign,
          ball: c.pokeball,
          hp: fillBar ? 0 : full,
          maxHp,
          status: null,
          shiny: c.shiny,
          altColor: c.altColor,
        });
        (side === 'player' ? setPVisible : setFVisible)(true);
        (side === 'player' ? setPAnim : setFAnim)(IDLE);
        if (animate) {
          (side === 'player' ? setPSpawn : setFSpawn)((n) => n + 1);
        }
        if (fillBar) {
          // Matches the ball-open beat in index.css so the bar fills as the
          // Pokémon materialises.
          window.setTimeout(
            () => setter((v) => ({ ...v, hp: full })),
            620 / speed,
          );
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
        // Spell out the result in the log: damage taken, plus why it landed the
        // way it did (effectiveness, crit, STAB). Self-inflicted confusion hits
        // carry their own text and have no moveName, so leave those untouched.
        if (e.moveName && e.affected) {
          const targetName = (e.affected === 'player' ? player : foe).name;
          const atkTypes = (e.actor === 'player' ? player : foe).types;
          const tags: string[] = [];
          if (label) tags.push(label);
          if (e.crit) tags.push('Critical hit!');
          if (e.moveType && atkTypes.includes(e.moveType)) tags.push('STAB ×1.5');
          logText = `${targetName} took ${e.damage} dmg${
            tags.length ? ` · ${tags.join(' · ')}` : ''
          }`;
        }
        break;
      }
      case 'transform': {
        const side = e.actor!;
        const t = e.transform!;
        const setter = side === 'player' ? setPlayer : setFoe;
        // Swap identity in place: the combatant is keyed by dexId, so the new
        // species materialises (a morph) without replaying the ball toss.
        setter((v) => ({
          ...v,
          name: t.name,
          dexId: t.dexId,
          sprite: side === 'player' ? t.back : t.sprite,
          types: t.types,
          sign: t.sign,
        }));
        if (animate) (side === 'player' ? setPAnim : setFAnim)(IDLE);
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
    if (logText) setLog((l) => [...l.slice(-40), logText]);
  };

  // Dev cheat: when "auto-win every match" is on, resolve the fight as a win the
  // moment the screen mounts — no animation, straight to the next stage. Guarded
  // by a ref so it fires exactly once even under StrictMode's double-invoke.
  const autoWon = useRef(false);
  useEffect(() => {
    if (autoWon.current || !autoWinEnabled()) return;
    autoWon.current = true;
    const t = window.setTimeout(() => onComplete('player'), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            onClick={() => setShowGuide(true)}
            aria-label="How battles work"
            className="grid h-7 w-7 place-items-center rounded-full border border-white/20 text-xs font-semibold transition hover:bg-white/10"
          >
            ?
          </button>
          <button
            type="button"
            onClick={() =>
              setSpeed((s) => {
                const next =
                  SPEED_CYCLE[(SPEED_CYCLE.indexOf(s as 1 | 2 | 4) + 1) % SPEED_CYCLE.length];
                if (typeof window !== 'undefined')
                  window.localStorage.setItem(SPEED_KEY, String(next));
                return next;
              })
            }
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold transition hover:bg-white/10"
          >
            {speed}× speed
          </button>
          {import.meta.env.DEV && !finished && (
            <>
              <button
                type="button"
                onClick={() => onComplete('player')}
                className="rounded-full border border-emerald-400/40 px-3 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
              >
                Win ✓
              </button>
              <button
                type="button"
                onClick={skip}
                className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold transition hover:bg-white/10"
              >
                Skip ⏭
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative mt-4 min-h-[360px] flex-1 overflow-hidden rounded-3xl border border-white/10">
        {/* Battle backdrop (pixel-art, kept crisp) + a subtle darkening pass so
            sprites and cards stay readable over any background. */}
        <div
          className="absolute inset-0 bg-cover bg-center [image-rendering:pixelated]"
          style={{ backgroundImage: `url(${bg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/40" />

        {/* Both Pokémon meet in the middle, facing each other diagonally. */}
        <Combatant
          view={foe}
          side="foe"
          anim={fAnim}
          spawn={fSpawn}
          visible={fVisible}
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
          visible={pVisible}
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

        {/* Each HP card sits in the corner opposite its sprite (foe sprite is
            upper-right, player sprite lower-left) so the cards never cover the
            Pokémon — even on narrow phone screens. */}
        <InfoCard
          key={`fcard-${fSpawn}`}
          view={foe}
          faints={fFaints}
          teamSize={foeTeam.length}
          alignEnd={false}
          visible={fVisible}
          className="left-2 top-2 sm:left-3 sm:top-3"
        />
        <InfoCard
          key={`pcard-${pSpawn}`}
          view={player}
          faints={pFaints}
          teamSize={playerTeam.length}
          alignEnd
          visible={pVisible}
          className="bottom-2 right-2 sm:bottom-3 sm:right-3"
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

      {showGuide && <BattleGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}
