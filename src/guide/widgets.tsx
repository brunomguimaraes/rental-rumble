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
  MYTHIC_SIGNS,
  RARE_SIGNS,
  SIGN_INFO,
  SIGN_SPREAD,
  ZODIAC_SIGNS,
  signIconUrl,
  signLabel,
} from '../game/zodiac';
import { ABILITIES, abilityDescription } from '../game/abilities';

const ASSET = import.meta.env?.BASE_URL ?? '/';
const statusIconUrl = (icon: string) => `${ASSET}sprites/status/${icon}.png`;

// ---------------------------------------------------------------------------
// Static blurbs. These mirror battle.ts / moves.ts behaviour; keeping the data
// here (rather than in prose) lets the widgets render consistent cards and lets
// the .mdx pages stay short.
// ---------------------------------------------------------------------------

const STAT_BLURB: { key: string; label: string; desc: string }[] = [
  { key: 'HP', label: 'HP', desc: 'How much damage it can take before fainting.' },
  {
    key: 'P.ATK',
    label: 'Physical Attack',
    desc: 'Scales the damage its physical moves (punches, slams, bites) deal.',
  },
  {
    key: 'E.ATK',
    label: 'Energy Attack',
    desc: 'Scales the damage its energy moves (beams, blasts, auras) deal.',
  },
  {
    key: 'P.DEF',
    label: 'Physical Defense',
    desc: 'Cuts the damage it takes from physical moves.',
  },
  {
    key: 'E.DEF',
    label: 'Energy Defense',
    desc: 'Cuts the damage it takes from energy moves.',
  },
  { key: 'SPD', label: 'Speed', desc: 'Decides who moves first each turn.' },
];

const STATUSES: { name: string; icon: string; desc: string }[] = [
  {
    name: 'Burn',
    icon: 'burn',
    desc: 'Halves the victim’s Physical Attack and chips 1/12 of max HP each turn, for 4 turns. Guts shrugs it off.',
  },
  {
    name: 'Frostbite',
    icon: 'frostbite',
    desc: 'Burn’s mirror on the energy side: halves Energy Attack and chips 1/12 of max HP each turn, for 4 turns. The answer to a special sweeper.',
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
  {
    name: 'Weight Down',
    icon: 'weight',
    desc: 'Speed is crushed to 45% for a few turns — enough to flip the turn order. Stacks on top of any other status.',
  },
  {
    name: 'Blinded',
    icon: 'blind',
    desc: 'The victim’s own moves land at 65% accuracy for a few turns — it can’t see to aim.',
  },
  {
    name: 'Disarmed',
    icon: 'disarm',
    desc: 'The foe’s single strongest move is sealed for a few turns, forcing it onto weaker options.',
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

/** The four core stats as a compact card grid. */
export function StatGrid() {
  return (
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
  );
}

/** Status-condition cards, each with its in-game icon. */
export function StatusList() {
  return (
    <div className="space-y-1.5">
      {STATUSES.map((s) => (
        <div
          key={s.name}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
        >
          <img
            src={statusIconUrl(s.icon)}
            alt=""
            className="h-5 w-5 shrink-0 object-contain"
          />
          <div className="min-w-0">
            <div className="text-xs font-bold">{s.name}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-white/55">
              {s.desc}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The full ability roster, pulled live from abilities.ts. */
export function AbilityList() {
  return (
    <div className="space-y-1.5">
      {Object.values(ABILITIES).map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-2.5"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-300/15 text-[11px] text-amber-200">
            ✦
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold">{a.name}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-white/55">
              {abilityDescription(a.id, import.meta.env.DEV)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A small explorer: pick an attacking type, see how it fares vs every type. */
export function TypeChartExplorer() {
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
export function ZodiacTable() {
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
              <thead>
                <tr className="text-[8px] uppercase tracking-wide text-white/35">
                  <th className="px-2 py-1 text-left font-semibold">Sign</th>
                  <th className="w-8 px-0.5 py-1 text-center font-semibold">HP</th>
                  <th className="w-8 px-0.5 py-1 text-center font-semibold">P.Atk</th>
                  <th className="w-8 px-0.5 py-1 text-center font-semibold">E.Atk</th>
                  <th className="w-8 px-0.5 py-1 text-center font-semibold">P.Def</th>
                  <th className="w-8 px-0.5 py-1 text-center font-semibold">E.Def</th>
                  <th className="w-8 px-0.5 py-1 text-center font-semibold">Spd</th>
                </tr>
              </thead>
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
                      <td className={`w-8 px-0.5 py-1.5 text-center tabular-nums ${pctClass(sp.hp)}`}>
                        {pct(sp.hp)}
                      </td>
                      <td className={`w-8 px-0.5 py-1.5 text-center tabular-nums ${pctClass(sp.atk)}`}>
                        {pct(sp.atk)}
                      </td>
                      <td className={`w-8 px-0.5 py-1.5 text-center tabular-nums ${pctClass(sp.eatk)}`}>
                        {pct(sp.eatk)}
                      </td>
                      <td className={`w-8 px-0.5 py-1.5 text-center tabular-nums ${pctClass(sp.def)}`}>
                        {pct(sp.def)}
                      </td>
                      <td className={`w-8 px-0.5 py-1.5 text-center tabular-nums ${pctClass(sp.edef)}`}>
                        {pct(sp.edef)}
                      </td>
                      <td className={`w-8 px-0.5 py-1.5 text-center tabular-nums ${pctClass(sp.spd)}`}>
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

/** The rare/mythic celestial signs: big mixed boosts at long odds. */
export function CelestialTable() {
  const rows: { sign: (typeof RARE_SIGNS)[number]; accent: string }[] = [
    ...RARE_SIGNS.map((sign) => ({ sign, accent: '#a78bfa' })),
    ...MYTHIC_SIGNS.map((sign) => ({ sign, accent: '#ffcf50' })),
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <table className="w-full border-collapse text-left text-[11px]">
        <tbody>
          {rows.map(({ sign, accent }) => {
            return (
              <tr key={sign} className="border-t border-white/10 first:border-t-0">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <img src={signIconUrl(sign)} alt="" className="h-4 w-4 object-contain" />
                    {signLabel(sign)}
                    <span
                      className="text-[9px] font-black uppercase tracking-wide"
                      style={{ color: accent }}
                    >
                      {SIGN_INFO[sign].tier}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/45">{SIGN_INFO[sign].tagline}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
