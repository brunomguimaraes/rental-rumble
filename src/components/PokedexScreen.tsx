import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Creature, PokemonType } from '../game/types';
import { CREATURES } from '../game/pokemon';
import { abilitiesForDex, abilityInfo } from '../game/abilities';
import {
  ALL_TYPES,
  TYPE_COLORS,
  typeIconUrl,
  typeLabel,
} from '../game/typechart';
import { signIconUrl, signLabel, signSummary } from '../game/zodiac';
import { TypeBadges } from './TypeBadge';

const GOLD = '#f5c542';

// How many entries to reveal at a time — keeps the initial paint light even
// though the full National Dex is 1,025 mons.
const PAGE = 120;

function dexNo(dexId: number): string {
  return `#${String(dexId).padStart(4, '0')}`;
}

/** Swap a missing PMD portrait for the species' front battle sprite. */
function handleImgError(e: React.SyntheticEvent<HTMLImageElement>, fallback: string) {
  const img = e.currentTarget;
  if (img.src !== fallback) img.src = fallback;
}

// One labelled base-stat bar (raw base value, no sign tilt — the Pokédex shows a
// species' innate line). The max mirrors CreatureCard so bars read consistently.
function BaseStatBar({ label, value, max = 200 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const hot = value >= 120;
  const fill = hot ? 'bg-amber-300/70' : value >= 80 ? 'bg-emerald-400/60' : 'bg-white/45';
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-white/45">
        {label}
      </span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/70">
        {value}
      </span>
    </div>
  );
}

function bst(c: Creature): number {
  const s = c.stats;
  return s.hp + s.atk + s.eatk + s.def + s.edef + s.spd;
}

/** A compact dex tile — normal portrait, number, name, types. */
function DexTile({ creature, onSelect }: { creature: Creature; onSelect: () => void }) {
  const color = TYPE_COLORS[creature.types[0]];
  const special = creature.tier !== 'normal';
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-center transition hover:border-white/30 hover:bg-white/[0.07]"
    >
      <div
        className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl"
        style={{ background: `${color}1f`, border: `1px solid ${special ? GOLD : color}55` }}
      >
        <img
          src={creature.portrait}
          alt={creature.name}
          loading="lazy"
          onError={(e) => handleImgError(e, creature.sprite)}
          className="h-16 w-16 object-cover [image-rendering:auto]"
        />
      </div>
      <div className="text-[9px] tabular-nums text-white/35">{dexNo(creature.dexId)}</div>
      <div className="line-clamp-1 text-[11px] font-bold leading-tight">{creature.name}</div>
      <div className="flex flex-wrap justify-center gap-0.5">
        {creature.types.map((t) => (
          <img
            key={t}
            src={typeIconUrl(t)}
            alt={typeLabel(t)}
            title={typeLabel(t)}
            className="h-3.5 w-3.5 object-contain"
          />
        ))}
      </div>
    </button>
  );
}

/** Full detail for a single species: portrait, base stats, abilities, signs. */
function DexDetail({ creature, onClose }: { creature: Creature; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const abilities = abilitiesForDex(creature.dexId).map(abilityInfo);
  const accent = creature.tier !== 'normal' ? GOLD : TYPE_COLORS[creature.types[0]];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0c0c14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <div
            className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl"
            style={{ background: `${accent}1f`, border: `1px solid ${accent}66` }}
          >
            <img
              src={creature.portrait}
              alt={creature.name}
              onError={(e) => handleImgError(e, creature.sprite)}
              className="h-16 w-16 object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] tabular-nums text-white/40">{dexNo(creature.dexId)}</div>
            <h3 className="truncate text-xl font-black">{creature.name}</h3>
            <div className="mt-1">
              <TypeBadges types={creature.types} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/20 text-sm transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-white/45">
                Base stats
              </h4>
              <span className="text-[10px] text-white/40">Total {bst(creature)}</span>
            </div>
            <div className="space-y-1.5">
              <BaseStatBar label="HP" value={creature.stats.hp} />
              <BaseStatBar label="P.Atk" value={creature.stats.atk} />
              <BaseStatBar label="E.Atk" value={creature.stats.eatk} />
              <BaseStatBar label="P.Def" value={creature.stats.def} />
              <BaseStatBar label="E.Def" value={creature.stats.edef} />
              <BaseStatBar label="Speed" value={creature.stats.spd} />
            </div>
          </section>

          <section>
            <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-white/45">
              Possible abilities
            </h4>
            <div className="space-y-1.5">
              {abilities.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-2.5"
                >
                  <div className="text-xs font-bold text-amber-200/90">✦ {a.name}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-white/55">
                    {a.description}
                  </div>
                </div>
              ))}
              {abilities.length === 0 && (
                <div className="text-[11px] text-white/40">No ability.</div>
              )}
            </div>
          </section>

          <section>
            <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-white/45">
              Sign fit <span className="font-medium normal-case text-white/35">(best-fit first)</span>
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {creature.eligibleSigns.map((sign, i) => (
                <span
                  key={sign}
                  title={signSummary(sign)}
                  className={`inline-flex cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    i === 0 ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/70'
                  }`}
                >
                  <img src={signIconUrl(sign)} alt="" className="h-3.5 w-3.5 object-contain" />
                  {signLabel(sign)}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-white/35">
              A Pokémon can carry any sign, but the draft favours the ones that suit its stats —
              the green one is its best fit.
            </p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PokedexScreen({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PokemonType | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<Creature | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qNum = q.replace(/^#/, '');
    return CREATURES.filter((c) => {
      if (typeFilter && !c.types.includes(typeFilter)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        String(c.dexId) === qNum ||
        dexNo(c.dexId).includes(qNum)
      );
    });
  }, [query, typeFilter]);

  // Reset the reveal window whenever the result set changes.
  useEffect(() => {
    setVisible(PAGE);
  }, [query, typeFilter]);

  const shown = filtered.slice(0, visible);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-5xl flex-col px-3 py-4 sm:px-5 sm:py-6">
      <header className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold text-white/75 transition hover:bg-white/10"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-lg font-black leading-tight">Pokédex</h1>
          <p className="text-[11px] text-white/40">
            Every species in play — its base stats, the abilities it can roll, and which signs suit it.
          </p>
        </div>
      </header>

      <div className="mb-3 flex flex-col gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or number…"
          className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 placeholder:text-white/30 focus:border-white/40 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setTypeFilter(null)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
              typeFilter === null
                ? 'border-white/60 bg-white/15 text-white'
                : 'border-white/10 text-white/55 hover:bg-white/10'
            }`}
          >
            All
          </button>
          {ALL_TYPES.map((t) => {
            const active = typeFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(active ? null : t)}
                title={typeLabel(t)}
                className={`grid h-7 w-7 place-items-center rounded-lg border transition ${
                  active ? 'border-white/70 bg-white/15' : 'border-white/10 hover:bg-white/10'
                }`}
                style={active ? { boxShadow: `0 0 0 1px ${TYPE_COLORS[t]}` } : undefined}
              >
                <img src={typeIconUrl(t)} alt={typeLabel(t)} className="h-4 w-4 object-contain" />
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-white/40">
          {filtered.length} {filtered.length === 1 ? 'species' : 'species'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
        {shown.map((c) => (
          <DexTile key={c.id} creature={c} onSelect={() => setSelected(c)} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-10 text-center text-sm text-white/40">No Pokémon match that search.</div>
      )}

      {visible < filtered.length && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-full border border-white/20 px-6 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10"
          >
            Show more ({filtered.length - visible} left)
          </button>
        </div>
      )}

      {selected && <DexDetail creature={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
