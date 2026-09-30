import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Creature, PokemonType } from '../../game/types';
import { abilitiesForDex, abilityInfo } from '../../game/abilities';
import {
  candidateMovesFor,
  moveCategoryLabel,
  moveEffectLabel,
  moveSelfNote,
} from '../../game/moves';
import { TYPE_COLORS, typeLabel } from '../../game/typechart';
import { signIconUrl, signLabel, signSummary } from '../../game/zodiac';
import { PixelSprite } from '../ui/PixelSprite';
import { StatBar } from '../ui/StatBar';
import { CollectionPips } from './CollectionPips';
import {
  COLLECTION_LAYERS,
  DEX_TABS,
  baseStatTotal,
  caughtAny,
  paddedDexNo,
  type DexTab,
  type VariantMarks,
} from './dex';

const LCD_GRID: CSSProperties = {
  backgroundImage:
    'linear-gradient(var(--color-lcd-grid) 1px, transparent 1px), linear-gradient(90deg, var(--color-lcd-grid) 1px, transparent 1px)',
  backgroundSize: '8px 8px',
};

const STAT_ROWS = [
  ['HP', 'hp'],
  ['P.Atk', 'atk'],
  ['E.Atk', 'eatk'],
  ['P.Def', 'def'],
  ['E.Def', 'edef'],
  ['Speed', 'spd'],
] as const;

function TypeChip({ type }: { type: PokemonType }) {
  return (
    <span
      className="inline-block px-1 font-label text-[9px] uppercase leading-4 text-white [text-shadow:1px_1px_0_#000]"
      style={{ background: TYPE_COLORS[type] }}
    >
      {typeLabel(type)}
    </span>
  );
}

function MoveTag({ children }: { children: ReactNode }) {
  return <span className="bg-lcd-ink px-0.5 font-label text-[8px] uppercase text-lcd">{children}</span>;
}

function StatsPanel({ creature, marks }: { creature: Creature; marks: VariantMarks | null }) {
  return (
    <div className="space-y-2">
      {marks && (
        <ul className="flex flex-wrap gap-x-3 text-xs">
          {COLLECTION_LAYERS.map((l) => (
            <li key={l.key} className={marks[l.key] ? '' : 'text-lcd-ink/75'}>
              {marks[l.key] ? '■' : '□'} {l.label}
              {marks[l.key] ? '' : ' — not yet'}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1">
        {STAT_ROWS.map(([label, key]) => {
          const value = creature.stats[key];
          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className="w-11 shrink-0 font-label text-[9px] uppercase">{label}</span>
              <StatBar tone="lcd" value={value} max={200} label={`${label} ${value}`} />
              <span className="w-8 shrink-0 text-right tabular-nums">{value}</span>
            </div>
          );
        })}
      </div>
      <div className="text-right font-label text-[9px] uppercase">
        Total {baseStatTotal(creature)}
      </div>
    </div>
  );
}

function AbilityPanel({ creature }: { creature: Creature }) {
  const abilities = abilitiesForDex(creature.dexId).map(abilityInfo);
  if (abilities.length === 0) return <p className="text-xs">No ability.</p>;
  return (
    <ul className="space-y-2">
      {abilities.map((a) => (
        <li key={a.id}>
          <div className="text-sm font-bold">✦ {a.name}</div>
          <p className="text-xs leading-snug">{a.description}</p>
        </li>
      ))}
    </ul>
  );
}

function MovesPanel({ creature }: { creature: Creature }) {
  const moves = useMemo(
    () => candidateMovesFor(creature.types, creature.dexId),
    [creature.types, creature.dexId],
  );
  const own = new Set(creature.types);
  return (
    <div>
      <div className="flex justify-end gap-2 font-label text-[8px] uppercase">
        <span className="w-9 text-right">Pow</span>
        <span className="w-9 text-right">Acc</span>
      </div>
      <ul>
        {moves.map((move) => {
          const selfNote = moveSelfNote(move);
          return (
            <li
              key={move.name}
              className="flex items-center gap-2 border-b border-dashed border-lcd-dim py-1 text-xs"
            >
              <TypeChip type={move.type} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1 font-semibold">
                  {move.name}
                  {own.has(move.type) && <MoveTag>STAB</MoveTag>}
                  {move.priority ? <MoveTag>Priority</MoveTag> : null}
                  {move.pp ? <MoveTag>{move.pp} PP</MoveTag> : null}
                </div>
                <div className="text-lcd-ink/75">
                  {moveCategoryLabel(move)}
                  {move.effect && ` · ${moveEffectLabel(move.effect)}`}
                  {selfNote && ` · ${selfNote}`}
                </div>
              </div>
              <span className="w-9 shrink-0 text-right tabular-nums">
                {move.power === 0 ? '—' : move.power}
              </span>
              <span className="w-9 shrink-0 text-right tabular-nums">
                {Math.round(move.accuracy * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-xs leading-snug text-lcd-ink/75">
        Every move this species can roll or swap into after battle. Its actual kit depends on sign,
        stats, and build.
      </p>
    </div>
  );
}

function SignsPanel({ creature }: { creature: Creature }) {
  return (
    <div>
      <ul className="flex flex-wrap gap-1">
        {creature.eligibleSigns.map((sign, i) => (
          <li
            key={sign}
            title={signSummary(sign)}
            className={`inline-flex items-center gap-1 px-1 py-0.5 font-label text-[9px] uppercase ${
              i === 0 ? 'bg-lcd-ink text-lcd' : 'bg-lcd-dim'
            }`}
          >
            <img src={signIconUrl(sign)} alt="" className="h-3.5 w-3.5 object-contain" />
            {signLabel(sign)}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs leading-snug text-lcd-ink/75">
        A Pokémon can carry any sign, but the draft favours the ones that suit its stats. The dark one
        is its best fit.
      </p>
    </div>
  );
}

/** The DS top screen: the selected species and its tabbed details. */
export function DexTopScreen({
  creature,
  marks,
  hidden,
  collectionError,
  tab,
  onTab,
}: {
  creature: Creature | null;
  marks: VariantMarks | null;
  /** Undiscovered: silhouette only, no name or details. */
  hidden: boolean;
  collectionError: boolean;
  tab: DexTab;
  onTab: (tab: DexTab) => void;
}) {
  if (!creature) {
    return (
      <div
        className="grid h-[300px] place-items-center bg-lcd font-pixel text-sm text-lcd-ink sm:h-[380px]"
        style={LCD_GRID}
      >
        <div className="flex flex-col items-center gap-2">
          {/* 197px smooth art, not pixel-sized: a plain contained image. */}
          <img src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`} alt="" className="h-12 w-12 object-contain" />
          Search the Pokédex
        </div>
      </div>
    );
  }
  const uncaught = marks !== null && !caughtAny(marks);
  return (
    <div
      className="flex h-[300px] flex-col bg-lcd font-pixel text-lcd-ink sm:h-[380px]"
      style={LCD_GRID}
    >
      <div className="flex items-center gap-3 p-2">
        <PixelSprite
          src={creature.sprite}
          size={96}
          alt={hidden ? 'Unknown Pokémon' : creature.name}
          silhouette={hidden}
          className="sm:h-48 sm:w-48"
        />
        <div className="min-w-0 flex-1">
          <div className="font-label text-[10px]">No.{paddedDexNo(creature.dexId)}</div>
          <h2 className="truncate text-lg font-bold uppercase leading-tight">
            {hidden ? '???' : creature.name}
          </h2>
          <div className="mt-1 flex flex-wrap gap-1">
            {creature.types.map((t) => (
              <TypeChip key={t} type={t} />
            ))}
          </div>
          {marks && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              <CollectionPips marks={marks} />
              {uncaught ? 'Not caught yet' : 'Caught'}
            </div>
          )}
          {collectionError && (
            <p className="mt-1.5 text-xs text-dex-red-dark">Couldn’t load your collection.</p>
          )}
        </div>
      </div>
      {hidden ? (
        <p className="m-2 mt-0 border-t border-dashed border-lcd-dim pt-2 text-xs leading-snug text-lcd-ink/75">
          {marks
            ? 'Not yet discovered. Catch one to record its stats, ability, moves, and signs.'
            : 'Loading your collection…'}
        </p>
      ) : (
        <>
          <div role="tablist" aria-label="Pokédex details" className="flex gap-0.5 px-2">
            {DEX_TABS.map((t) => (
              <button
                key={t.id}
                id={`dex-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="dex-tabpanel"
                onClick={() => onTab(t.id)}
                className={`ui-focus-ink px-1.5 py-0.5 font-label text-[10px] uppercase ${
                  tab === t.id ? 'bg-lcd-ink text-lcd' : 'bg-lcd-dim text-lcd-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            id="dex-tabpanel"
            role="tabpanel"
            aria-labelledby={`dex-tab-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {tab === 'stats' && <StatsPanel creature={creature} marks={marks} />}
            {tab === 'ability' && <AbilityPanel creature={creature} />}
            {tab === 'moves' && <MovesPanel creature={creature} />}
            {tab === 'signs' && <SignsPanel creature={creature} />}
          </div>
        </>
      )}
    </div>
  );
}
