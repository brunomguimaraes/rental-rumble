import { useEffect, useMemo, useState } from 'react';
import type { PokemonType } from '../game/types';
import { CREATURES } from '../game/pokemon';
import { fetchPokedex, hasForm, type AccountUser, type OwnedDex } from '../game/account';
import { DexDevice } from './pokedex/DexDevice';
import { DexFilters } from './pokedex/DexFilters';
import { DexList } from './pokedex/DexList';
import { DexTopScreen } from './pokedex/DexTopScreen';
import {
  PAGE,
  caughtAny,
  filterCreatures,
  marksFor,
  revealFor,
  tabsFor,
  type DexReveal,
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
  const loading = collection.status === 'loading';
  const reveal = (dexId: number) => revealFor(owned, loading, dexId);
  const undiscovered = (dexId: number) => reveal(dexId) === 'hidden';

  const counts = useMemo(() => {
    if (!owned) return { seen: 0, caught: 0 };
    let seen = 0;
    let caught = 0;
    for (const c of CREATURES) {
      const m = marksFor(owned, c.dexId);
      const isCaught = m !== null && caughtAny(m);
      if (isCaught) caught += 1;
      if (isCaught || hasForm(owned.seen, c.dexId)) seen += 1;
    }
    return { seen, caught };
  }, [owned]);

  const filtered = useMemo(
    () =>
      filterCreatures(CREATURES, {
        query,
        type: typeFilter,
        undiscovered: (dexId) => revealFor(owned, loading, dexId) === 'hidden',
      }),
    [query, typeFilter, owned, loading],
  );

  // Keep the picked species while it still matches; otherwise the first result.
  const selected = filtered.find((c) => c.dexId === pickedId) ?? filtered[0] ?? null;
  const selectedIndex = selected ? filtered.indexOf(selected) : -1;
  const selectedReveal: DexReveal = selected ? reveal(selected.dexId) : 'hidden';
  const tabs = tabsFor(selectedReveal);
  // A tab the selected entry can't open yet (stats on a seen-only entry) falls back to Area.
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  // Always reveal far enough to include the selection.
  const shown = filtered.slice(0, Math.max(visible, selectedIndex + 1));

  // A filter that drops the picked species moves the LCD to the first result;
  // save that as the pick, so clearing the filter stays on what the player saw
  // instead of jumping back. With no results the last shown species is kept.
  const applyFilter = (nextQuery: string, nextType: PokemonType | null) => {
    const next = filterCreatures(CREATURES, { query: nextQuery, type: nextType, undiscovered });
    const current = selected?.dexId ?? pickedId;
    const stays = current !== null && next.some((c) => c.dexId === current);
    setPickedId(stays || next.length === 0 ? current : next[0].dexId);
    setQuery(nextQuery);
    setTypeFilter(nextType);
    setVisible(PAGE);
  };

  const countLabel =
    collection.status === 'ready'
      ? `Seen ${counts.seen} · Caught ${counts.caught}`
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
        const i = tabs.findIndex((t) => t.id === activeTab);
        const step = e.key === 'ArrowRight' ? 1 : tabs.length - 1;
        setTab(tabs[(i + step) % tabs.length].id);
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
  }, [onBack, tabs, activeTab, filtered, selectedIndex]);

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
            reveal={selectedReveal}
            collectionError={collection.status === 'failed'}
            tabs={tabs}
            tab={activeTab}
            onTab={setTab}
          />
        }
        bottom={
          <>
            <DexFilters
              query={query}
              onQuery={(q) => applyFilter(q, typeFilter)}
              type={typeFilter}
              onType={(t) => applyFilter(query, t)}
            />
            <DexList
              creatures={shown}
              total={filtered.length}
              selectedId={selected?.dexId ?? null}
              onSelect={setPickedId}
              marksOf={(dexId) => marksFor(owned, dexId)}
              revealOf={reveal}
              onMore={() => setVisible((v) => v + PAGE)}
            />
          </>
        }
      />
    </div>
  );
}
