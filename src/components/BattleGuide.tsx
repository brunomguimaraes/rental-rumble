import { useState } from 'react';
import type { PokemonType } from '../game/types';
import {
  ALL_TYPES,
  TYPE_COLORS,
  typeIconUrl,
  typeLabel,
  typeMultiplier,
} from '../game/typechart';
import {
  ELEMENT_INFO,
  ELEMENT_ORDER,
  SIGN_INFO,
  SIGN_SPREAD,
  ZODIAC_SIGNS,
  signIconUrl,
  signLabel,
} from '../game/zodiac';
import { MOVE_SLOTS } from '../game/moves';

const STAT_BLURB: { key: string; label: string; desc: string }[] = [
  { key: 'HP', label: 'HP', desc: 'How much damage it can take before fainting.' },
  { key: 'ATK', label: 'Attack', desc: 'Scales the damage its moves deal.' },
  { key: 'DEF', label: 'Defense', desc: 'Cuts the damage it takes from hits.' },
  { key: 'SPD', label: 'Speed', desc: 'Decides who moves first each turn.' },
];

const ASSET = import.meta.env?.BASE_URL ?? '/';
const statusIconUrl = (icon: string) => `${ASSET}sprites/status/${icon}.png`;

const STATUSES: { name: string; icon: string; desc: string }[] = [
  {
    name: 'Burn',
    icon: 'burn',
    desc: 'Chips 1/12 of max HP at the end of each turn, for 4 turns.',
  },
  {
    name: 'Poison',
    icon: 'poison',
    desc: 'Escalating damage: turn N costs N/16 of max HP and never wears off — a clock on bulky walls.',
  },
  {
    name: 'Paralysis',
    icon: 'stun',
    desc: 'Speed drops to 60% and there is a 30% chance to lose the turn outright.',
  },
  {
    name: 'Sleep',
    icon: 'sleep',
    desc: "Can't act for 1–3 turns, then wakes up.",
  },
  {
    name: 'Confusion',
    icon: 'confusion',
    desc: 'For 2–4 turns there is a 33% chance to hit itself instead of attacking.',
  },
];

// The AI's fixed decision order each turn (mirrors chooseMove in battle.ts).
const AI_PRIORITY: { step: string; desc: string }[] = [
  { step: 'Guaranteed KO', desc: 'If any move (priority first) is forecast to faint the foe, take it.' },
  { step: 'Heal', desc: 'Below 35% HP, there is a 60% chance to use a sustain move like Recover.' },
  { step: 'Set up', desc: 'Above 60% HP and not yet stacked, a 40% chance to buff a stat (Swords Dance, Agility, Iron Defense).' },
  { step: 'Spread status', desc: 'Against an unafflicted foe, a 35% chance to fish for burn / paralysis / poison / sleep.' },
  { step: 'Best damage', desc: 'Otherwise throw the move with the highest forecast damage vs. this defender (coverage matters).' },
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

/** The 12 signs grouped by element, with their stat tilts. */
function ZodiacTable() {
  return (
    <div className="space-y-3">
      {ELEMENT_ORDER.map((el) => {
        const info = ELEMENT_INFO[el];
        const signs = ZODIAC_SIGNS.filter((s) => SIGN_INFO[s].element === el);
        return (
          <div key={el} className="overflow-hidden rounded-2xl border border-white/10">
            <div
              className="flex items-center justify-between px-2.5 py-1.5"
              style={{ background: `${info.color}1f` }}
            >
              <span className="text-xs font-black" style={{ color: info.color }}>
                {info.label}
              </span>
              <span className="text-[10px] text-white/50">{info.blurb}</span>
            </div>
            <table className="w-full border-collapse text-left text-[11px]">
              <tbody>
                {signs.map((sign) => {
                  const sp = SIGN_SPREAD[sign];
                  return (
                    <tr key={sign} className="border-t border-white/10">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5 font-bold">
                          <img
                            src={signIconUrl(sign)}
                            alt=""
                            className="h-4 w-4 object-contain"
                          />
                          {signLabel(sign)}
                          <span className="text-[9px] font-medium uppercase tracking-wide text-white/35">
                            {SIGN_INFO[sign].modality}
                          </span>
                        </div>
                        <div className="text-[10px] text-white/45">
                          {SIGN_INFO[sign].tagline}
                        </div>
                      </td>
                      <td className={`w-9 px-1 py-1.5 text-center tabular-nums ${pctClass(sp.hp)}`}>
                        {pct(sp.hp)}
                      </td>
                      <td className={`w-9 px-1 py-1.5 text-center tabular-nums ${pctClass(sp.atk)}`}>
                        {pct(sp.atk)}
                      </td>
                      <td className={`w-9 px-1 py-1.5 text-center tabular-nums ${pctClass(sp.def)}`}>
                        {pct(sp.def)}
                      </td>
                      <td className={`w-9 px-1 py-1.5 text-center tabular-nums ${pctClass(sp.spd)}`}>
                        {pct(sp.spd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** The exact damage math, for the curious. All fights run at Level 50. */
function DamageMath() {
  return (
    <div className="space-y-2 text-[11px] leading-relaxed text-white/60">
      <p>
        Every Pokémon fights at <span className="font-semibold text-white/80">Level 50</span>, so the
        stat lines simplify to:
      </p>
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-2.5 font-mono text-[10.5px] text-white/75">
{`HP  = base + 60
Atk/Def/Spd = (base + 5) × sign × stage
stage(+n) = (2+n)/2     stage(−n) = 2/(2+n)`}
      </pre>
      <p>A single hit then resolves as:</p>
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-2.5 font-mono text-[10.5px] text-white/75">
{`raw = (22 × power × Atk/Def) / 50 + 2
dmg = raw × STAB × type × crit × rand`}
      </pre>
      <ul className="ml-3 list-disc space-y-1 marker:text-white/30">
        <li><span className="font-semibold text-white/80">STAB</span> = 1.5× if the move shares the user's type, else 1×.</li>
        <li><span className="font-semibold text-white/80">type</span> = the type-effectiveness product (0, ¼, ½, 1, 2 or 4×).</li>
        <li><span className="font-semibold text-white/80">crit</span> = 1.5× on a 6.25% roll.</li>
        <li><span className="font-semibold text-white/80">rand</span> = a uniform 0.85–1.0 spread, so identical hits vary ±15%.</li>
        <li>The result is floored, with a minimum of 1 damage on any non-immune hit.</li>
      </ul>
      <p className="text-white/45">
        The AI sizes up moves with the same formula at mid-roll (×0.925) and multiplies by accuracy,
        so it can spot guaranteed KOs without rolling the dice.
      </p>
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
              Fights play out automatically — these are the rules under the hood,
              right down to the math.
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

        <Section title="Zodiac signs tilt the stats">
          <p className="mb-2 text-[11px] leading-snug text-white/50">
            Every Pokémon is born under one of twelve signs, which nudges its
            stats up or down (shown vs. its base line). The twelve break down as
            four <span className="text-white/75">elements</span> — the broad
            archetype — each split into three{' '}
            <span className="text-white/75">modalities</span> that set the flavour:
            cardinal initiates (Speed-lean), fixed is stubborn/extreme, mutable is
            rounded. A sign is an identity, so any Pokémon can carry any sign —
            but the draft favours the ones that suit its stats.
          </p>
          <ZodiacTable />
        </Section>

        <Section title="Move pools">
          <p className="text-[11px] leading-snug text-white/55">
            Forget the four-move limit: every Pokémon walks in with up to{' '}
            <span className="font-semibold text-white/80">{MOVE_SLOTS} moves</span>{' '}
            and the AI decides which to throw each turn. A pool layers its own
            STAB attacks, element-themed coverage (which shifts with the sign, so
            the same species plays differently run to run), a priority jab for
            fast attackers, one matching setup move, and{' '}
            <span className="font-semibold text-white/80">Recover</span> for bulky
            mons — sustain lives in the moveset now, not the sign.
          </p>
        </Section>

        <Section title="Turn order & the AI">
          <p className="mb-2 text-[11px] leading-snug text-white/55">
            Higher move priority (e.g. Quick Attack) always strikes first;
            otherwise the faster Pokémon goes, with ties broken by a coin flip.
            Each turn the AI walks a fixed checklist:
          </p>
          <ol className="space-y-1.5">
            {AI_PRIORITY.map((a, i) => (
              <li
                key={a.step}
                className="flex gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[10px] font-black text-white/70">
                  {i + 1}
                </span>
                <div>
                  <span className="text-xs font-bold">{a.step}</span>
                  <span className="ml-1.5 text-[11px] leading-snug text-white/55">
                    {a.desc}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="The damage formula">
          <DamageMath />
        </Section>

        <Section title="Status conditions">
          <div className="space-y-1.5">
            {STATUSES.map((s) => (
              <div
                key={s.name}
                className="flex gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
              >
                <img
                  src={statusIconUrl(s.icon)}
                  alt=""
                  className="h-5 w-5 shrink-0 object-contain"
                />
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
