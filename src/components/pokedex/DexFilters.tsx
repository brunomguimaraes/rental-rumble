import type { PokemonType } from '../../game/types';
import { ALL_TYPES, typeIconUrl, typeLabel } from '../../game/typechart';

/** Search plus one-type filter, in the bottom screen's top strip. */
export function DexFilters({
  query,
  onQuery,
  type,
  onType,
}: {
  query: string;
  onQuery: (q: string) => void;
  type: PokemonType | null;
  onType: (t: PokemonType | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 pb-1.5">
      <label htmlFor="dex-search" className="sr-only">
        Search the Pokédex
      </label>
      <input
        id="dex-search"
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search name or no.…"
        autoComplete="off"
        className="ui-focus w-full bg-paper px-2 py-1 font-pixel text-sm text-paper-ink placeholder:text-paper-ink/60"
      />
      <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-1">
        <button
          type="button"
          aria-pressed={type === null}
          onClick={() => onType(null)}
          className={`ui-focus h-6 px-1.5 font-label text-[9px] uppercase ${
            type === null ? 'bg-select text-paper-ink' : 'bg-paper/15 text-paper hover:bg-paper/30'
          }`}
        >
          All
        </button>
        {ALL_TYPES.map((t) => {
          const on = type === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              title={typeLabel(t)}
              onClick={() => onType(on ? null : t)}
              className={`ui-focus grid h-6 w-6 place-items-center ${
                on ? 'bg-select' : 'bg-paper/15 hover:bg-paper/30'
              }`}
            >
              <img src={typeIconUrl(t)} alt={typeLabel(t)} className="h-4 w-4 object-contain" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
