import { useEffect, useMemo, useState } from 'react';
import type { PokemonType } from '../game/types';
import { CREATURES } from '../game/pokemon';
import { fetchPokedex, type AccountUser, type OwnedDex } from '../game/account';
import { DexDevice } from './pokedex/DexDevice';
import { DexFilters } from './pokedex/DexFilters';
import { DexList } from './pokedex/DexList';
import { DexTopScreen } from './pokedex/DexTopScreen';
import {
  DEX_TABS,
  PAGE,
  caughtAny,
  filterCreatures,
  marksFor,
  type DexTab,
} from './pokedex/dex';

type Collection =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; owned: OwnedDex }
  | { status: 'failed' };

/** The Pokédex as a DS-style handheld: detail LCD on top, species list below. */
export function PokedexScreen({
  onBack,
  me,
}: {
  onBack: () => void;
  me?: AccountUser | null;
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PokemonType | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [tab, setTab] = useState<DexTab>('stats');
  const [collection, setCollection] = useState<Collection>(() =>
    me ? { status: 'loading' } : { status: 'none' },
  );

  // The signed-in player's owned dex. `null` from the helper is a failed load,
  // not an empty collection, so it gets its own state.
  useEffect(() => {
    if (!me) {
      setCollection({ status: 'none' });
      return;
    }
    let alive = true;
    setCollection({ status: 'loading' });
    fetchPokedex().then((owned) => {
      if (alive) setCollection(owned ? { status: 'ready', owned } : { status: 'failed' });
    });
    return () => {
      alive = false;
    };
  }, [me]);

  const owned = collection.status === 'ready' ? collection.owned : null;

  const caughtCount = useMemo(() => {
    if (!owned) return 0;
    return CREATURES.filter((c) => {
      const m = marksFor(owned, c.dexId);
      return m !== null && caughtAny(m);
    }).length;
  }, [owned]);

  const filtered = useMemo(
    () => filterCreatures(CREATURES, query, typeFilter),
    [query, typeFilter],
  );

  // Keep the picked species while it still matches; otherwise the first result.
  const selected = filtered.find((c) => c.dexId === pickedId) ?? filtered[0] ?? null;
  const selectedIndex = selected ? filtered.indexOf(selected) : -1;
  // Always reveal far enough to include the selection.
  const shown = filtered.slice(0, Math.max(visible, selectedIndex + 1));

  const countLabel =
    collection.status === 'ready'
      ? `${caughtCount} / ${CREATURES.length}`
      : collection.status === 'loading'
        ? `… / ${CREATURES.length}`
        : `${CREATURES.length} species`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        onBack();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const i = DEX_TABS.findIndex((t) => t.id === tab);
        const step = e.key === 'ArrowRight' ? 1 : DEX_TABS.length - 1;
        setTab(DEX_TABS[(i + step) % DEX_TABS.length].id);
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && selectedIndex >= 0) {
        e.preventDefault();
        const next = filtered[selectedIndex + (e.key === 'ArrowDown' ? 1 : -1)];
        if (!next) return;
        const rowFocused = document.activeElement?.id.startsWith('dex-row-') ?? false;
        setPickedId(next.dexId);
        requestAnimationFrame(() => {
          const row = document.getElementById(`dex-row-${next.dexId}`);
          if (rowFocused) row?.focus({ preventScroll: true });
          row?.scrollIntoView({ block: 'nearest' });
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, tab, filtered, selectedIndex]);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[552px] px-4 py-4 font-pixel text-ink sm:py-8">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="ui-button ui-focus px-3 py-1.5 font-label text-[10px] uppercase"
        >
          ◀ Back
        </button>
        <h1 className="font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">
          Pokédex
        </h1>
      </div>
      <DexDevice
        countLabel={countLabel}
        top={
          <DexTopScreen
            creature={selected}
            marks={selected ? marksFor(owned, selected.dexId) : null}
            collectionError={collection.status === 'failed'}
            tab={tab}
            onTab={setTab}
          />
        }
        bottom={
          <>
            <DexFilters
              query={query}
              onQuery={(q) => {
                setQuery(q);
                setVisible(PAGE);
              }}
              type={typeFilter}
              onType={(t) => {
                setTypeFilter(t);
                setVisible(PAGE);
              }}
            />
            <DexList
              creatures={shown}
              total={filtered.length}
              selectedId={selected?.dexId ?? null}
              onSelect={setPickedId}
              marksOf={(dexId) => marksFor(owned, dexId)}
              onMore={() => setVisible((v) => v + PAGE)}
            />
          </>
        }
      />
    </div>
  );
}
