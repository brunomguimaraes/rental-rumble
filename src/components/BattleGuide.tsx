import { useState } from 'react';
import type { PokemonType } from '../game/types';
import {
  ALL_TYPES,
  TYPE_COLORS,
  typeIconUrl,
  typeLabel,
  typeMultiplier,
} from '../game/typechart';
import { ALL_ROLES, ROLE_INFO, ROLE_SPREAD } from '../game/roles';

const STAT_BLURB: { key: string; label: string; desc: string }[] = [
  { key: 'HP', label: 'HP', desc: 'How much damage it can take before fainting.' },
  { key: 'ATK', label: 'Attack', desc: 'Scales the damage its moves deal.' },
  { key: 'DEF', label: 'Defense', desc: 'Cuts the damage it takes from hits.' },
  { key: 'SPD', label: 'Speed', desc: 'Decides who moves first each turn.' },
];

// FireRed/LeafGreen in-game status markers (see scripts/build-status-icons.py).
const STATUS_ASSET = import.meta.env?.BASE_URL ?? '/';
function statusIconUrl(kind: string): string {
  return `${STATUS_ASSET}sprites/status/${kind}.png`;
}

// `icon` points at the FRLG marker; `glyph` is the emoji fallback for statuses
// the games never show a marker for (confusion is a volatile status).
const STATUSES: { name: string; icon?: string; glyph?: string; desc: string }[] = [
  {
    name: 'Burn',
    icon: statusIconUrl('burn'),
    desc: 'Chips away ~1/12 of max HP at the end of each turn for a few turns.',
  },
  {
    name: 'Poison',
    icon: statusIconUrl('poison'),
    desc: 'Escalating damage that grows every turn and does not wear off — a clock on bulky walls.',
  },
  {
    name: 'Paralysis',
    icon: statusIconUrl('stun'),
    desc: 'Speed drops to 60% and there is a 30% chance to lose the turn outright.',
  },
  {
    name: 'Sleep',
    icon: statusIconUrl('sleep'),
    desc: "Can't act for 1–3 turns, then wakes up.",
  },
  {
    name: 'Confusion',
    glyph: '💫',
    desc: 'For 2–4 turns there is a 33% chance to hit itself instead of attacking.',
  },
];

const BASICS: { title: string; desc: string }[] = [
  {
    title: 'Turn order',
    desc: 'Priority moves (like Quick Attack) always strike first; otherwise the faster Pokémon goes, with ties decided by a coin flip.',
  },
  {
    title: 'STAB',
    desc: 'A move whose type matches the user’s own type deals 1.5× damage (Same-Type Attack Bonus).',
  },
  {
    title: 'Critical hits',
    desc: 'Every hit has a 6.25% chance to crit for 1.5× damage.',
  },
  {
    title: 'Type effectiveness',
    desc: 'Multipliers stack across both of a Pokémon’s types, so a hit can land for 0×, ¼×, ½×, 1×, 2×, or 4×.',
  },
  {
    title: 'Setting up',
    desc: 'Some Pokémon can buff their own stats mid-fight (Swords Dance raises Attack, Agility raises Speed) to snowball an advantage.',
  },
];

function pct(mult: number): string {
  const delta = Math.round((mult - 1) * 100);
  if (delta === 0) return '—';
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

function pctClass(mult: number): string {
  if (mult > 1) return 'text-emerald-300';
  if (mult < 1) return 'text-rose-300';
  return 'text-white/40';
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A small explorer: pick an attacking type, see how it fares vs every type. */
function TypeChartExplorer() {
  const [atk, setAtk] = useState<PokemonType>('fire');
  const grouped = {
    super: [] as PokemonType[],
    weak: [] as PokemonType[],
    none: [] as PokemonType[],
  };
  for (const def of ALL_TYPES) {
    const m = typeMultiplier(atk, def);
    if (m === 0) grouped.none.push(def);
    else if (m > 1) grouped.super.push(def);
    else if (m < 1) grouped.weak.push(def);
  }

  const Chip = ({ t }: { t: PokemonType }) => (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{
        background: `${TYPE_COLORS[t]}26`,
        color: TYPE_COLORS[t],
        border: `1px solid ${TYPE_COLORS[t]}66`,
      }}
    >
      <img src={typeIconUrl(t)} alt="" className="h-3 w-3 object-contain" />
      {typeLabel(t)}
    </span>
  );

  const Row = ({
    label,
    types,
    tint,
  }: {
    label: string;
    types: PokemonType[];
    tint: string;
  }) => (
    <div className="mt-2">
      <div className={`text-[11px] font-semibold ${tint}`}>{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {types.length ? (
          types.map((t) => <Chip key={t} t={t} />)
        ) : (
          <span className="text-[11px] text-white/30">none</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-1 text-[11px] text-white/50">
        When <span className="font-semibold text-white/80">attacking</span> with…
      </div>
      <div className="flex flex-wrap gap-1">
        {ALL_TYPES.map((t) => {
          const active = t === atk;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setAtk(t)}
              title={typeLabel(t)}
              className={`grid h-7 w-7 place-items-center rounded-lg border transition ${
                active
                  ? 'border-white/70 bg-white/15'
                  : 'border-white/10 hover:bg-white/10'
              }`}
            >
              <img
                src={typeIconUrl(t)}
                alt={typeLabel(t)}
                className="h-4 w-4 object-contain"
              />
            </button>
          );
        })}
      </div>
      <Row label="Super effective (2×)" types={grouped.super} tint="text-emerald-300" />
      <Row label="Not very effective (½×)" types={grouped.weak} tint="text-rose-300" />
      <Row label="No effect (0×)" types={grouped.none} tint="text-white/45" />
    </div>
  );
}

export function BattleGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-3 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="How battles work"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#15151c] p-5 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">How battles work</h2>
            <p className="mt-0.5 text-xs text-white/50">
              Fights play out automatically — these are the rules under the hood.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <Section title="The four stats">
          <div className="grid grid-cols-2 gap-2">
            {STAT_BLURB.map((s) => (
              <div
                key={s.key}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
              >
                <div className="text-sm font-bold">{s.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-white/55">
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Roles tilt the stats">
          <p className="mb-2 text-[11px] leading-snug text-white/50">
            Every Pokémon plays a role that nudges its stats up or down (shown vs.
            its base line). The choice shapes how it fights.
          </p>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full border-collapse text-left text-[11px]">
              <thead className="bg-white/[0.05] text-white/50">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Role</th>
                  <th className="px-1 py-1.5 text-center font-semibold">HP</th>
                  <th className="px-1 py-1.5 text-center font-semibold">Atk</th>
                  <th className="px-1 py-1.5 text-center font-semibold">Def</th>
                  <th className="px-1 py-1.5 text-center font-semibold">Spd</th>
                </tr>
              </thead>
              <tbody>
                {ALL_ROLES.map((role) => {
                  const sp = ROLE_SPREAD[role];
                  return (
                    <tr key={role} className="border-t border-white/10">
                      <td className="px-2 py-1.5">
                        <div className="font-bold">
                          {ROLE_INFO[role].glyph} {role}
                        </div>
                        <div className="text-[10px] text-white/45">
                          {ROLE_INFO[role].tagline}
                        </div>
                      </td>
                      <td className={`px-1 py-1.5 text-center tabular-nums ${pctClass(sp.hp)}`}>
                        {pct(sp.hp)}
                      </td>
                      <td className={`px-1 py-1.5 text-center tabular-nums ${pctClass(sp.atk)}`}>
                        {pct(sp.atk)}
                      </td>
                      <td className={`px-1 py-1.5 text-center tabular-nums ${pctClass(sp.def)}`}>
                        {pct(sp.def)}
                      </td>
                      <td className={`px-1 py-1.5 text-center tabular-nums ${pctClass(sp.spd)}`}>
                        {pct(sp.spd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Status conditions">
          <div className="space-y-1.5">
            {STATUSES.map((s) => (
              <div
                key={s.name}
                className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
              >
                {s.icon ? (
                  <img
                    src={s.icon}
                    alt={s.name}
                    className="mt-0.5 h-4 w-auto shrink-0 [image-rendering:pixelated]"
                  />
                ) : (
                  <span className="text-lg leading-none">{s.glyph}</span>
                )}
                <div>
                  <span className="text-xs font-bold">{s.name}</span>
                  <span className="ml-1.5 text-[11px] leading-snug text-white/55">
                    {s.desc}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type effectiveness">
          <TypeChartExplorer />
        </Section>

        <Section title="Battle basics">
          <div className="space-y-1.5">
            {BASICS.map((b) => (
              <div
                key={b.title}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
              >
                <span className="text-xs font-bold">{b.title}</span>
                <span className="ml-1.5 text-[11px] leading-snug text-white/55">
                  {b.desc}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-95"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
