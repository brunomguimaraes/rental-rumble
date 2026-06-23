import { useEffect, useRef, useState } from 'react';
import type { BattleEvent, BattleResult } from '../game/battle';
import type { Creature, Opponent, PokemonType, Role, Side } from '../game/types';
import { TYPE_COLORS, effectivenessLabel, typeIconUrl } from '../game/typechart';
import { ROLE_INFO } from '../game/roles';
import { HpBar } from './HpBar';
import { TypeBadges } from './TypeBadge';

interface ActiveView {
  name: string;
  sprite: string;
  types: PokemonType[];
  role: Role;
  hp: number;
  maxHp: number;
}

const DELAY: Record<BattleEvent['kind'], number> = {
  sendout: 600,
  move: 580,
  miss: 620,
  hit: 560,
  noeffect: 620,
  status: 620,
  heal: 580,
  statusTick: 580,
  stunned: 580,
  faint: 780,
  end: 500,
};

function spriteFor(c: Creature, side: Side): string {
  return side === 'player' ? c.back : c.sprite;
}

function initialView(c: Creature, side: Side): ActiveView {
  return {
    name: c.name,
    sprite: spriteFor(c, side),
    types: c.types,
    role: c.role,
    hp: 0,
    maxHp: 1,
  };
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
  const [hitFx, setHitFx] = useState<{
    side: Side;
    amount: number;
    crit: boolean;
    key: number;
  } | null>(null);
  const [speed, setSpeed] = useState(1);
  const [finished, setFinished] = useState(false);
  const fxKey = useRef(0);

  const processEvent = (e: BattleEvent, animate: boolean) => {
    if (e.affected && e.hp !== undefined && e.maxHp !== undefined) {
      const setter = e.affected === 'player' ? setPlayer : setFoe;
      setter((v) => ({ ...v, hp: e.hp!, maxHp: e.maxHp! }));
    }
    if (e.kind === 'move') {
      setBanner('');
      setBannerType(null);
    }
    switch (e.kind) {
      case 'sendout': {
        const setter = e.affected === 'player' ? setPlayer : setFoe;
        const team = e.affected === 'player' ? playerTeam : foeTeam;
        const c = team[e.index!];
        setter({
          name: c.name,
          sprite: spriteFor(c, e.affected!),
          types: c.types,
          role: c.role,
          hp: e.hp ?? 1,
          maxHp: e.maxHp ?? 1,
        });
        break;
      }
      case 'hit': {
        if (animate && e.affected) {
          setShake(e.affected);
          window.setTimeout(() => setShake(null), 380);
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

  const Field = ({
    view,
    side,
    faints,
    teamSize,
  }: {
    view: ActiveView;
    side: Side;
    faints: number;
    teamSize: number;
  }) => {
    const color = TYPE_COLORS[view.types[0]];
    const isFoe = side === 'foe';
    return (
      <div
        className={`flex items-center gap-3 sm:gap-4 ${isFoe ? 'flex-row-reverse text-right' : ''}`}
      >
        <div
          className={`relative grid h-20 w-20 shrink-0 place-items-center rounded-3xl sm:h-28 sm:w-28 ${
            shake === side ? 'animate-shake' : 'animate-floaty'
          }`}
          style={{ background: `${color}22`, border: `1px solid ${color}44` }}
        >
          <img
            src={view.sprite}
            alt={view.name}
            className="h-16 w-16 object-contain drop-shadow-lg sm:h-24 sm:w-24"
          />
          {hitFx && hitFx.side === side && (
            <span
              key={hitFx.key}
              className="pointer-events-none absolute -top-2 select-none text-xl font-black text-red-300"
              style={{ animation: 'floaty 0.6s ease-out' }}
            >
              -{hitFx.amount}
              {hitFx.crit ? '!' : ''}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${isFoe ? 'justify-end' : ''}`}
          >
            <span className="font-bold">{view.name}</span>
            <span
              className="text-[11px] text-white/45"
              title={ROLE_INFO[view.role].tagline}
            >
              {ROLE_INFO[view.role].glyph} {view.role}
            </span>
            <TypeBadges types={view.types} />
          </div>
          <div className="mt-1.5">
            <HpBar hp={view.hp} maxHp={view.maxHp} />
          </div>
          <div className={`mt-1.5 flex gap-1 ${isFoe ? 'justify-end' : ''}`}>
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
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src={opponent.badge}
            alt={opponent.title}
            className="h-8 w-8 shrink-0 object-contain"
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

      <div className="relative mt-4 flex flex-1 flex-col justify-center gap-6 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-4 sm:gap-8 sm:p-6">
        <Field view={foe} side="foe" faints={fFaints} teamSize={foeTeam.length} />

        {banner && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold text-amber-300 backdrop-blur">
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

        <Field
          view={player}
          side="player"
          faints={pFaints}
          teamSize={playerTeam.length}
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
