import type { Creature } from '../../game/types';
import { PixelSprite } from '../ui/PixelSprite';
import { PixelIcon } from '../world/PixelIcon';
import { CollectionPips } from './CollectionPips';
import { caughtAny, paddedDexNo, type DexReveal, type VariantMarks } from './dex';

/**
 * The DS bottom screen's paper list. On phones `scroll-mt-[320px]` keeps a
 * scrolled-to row below the sticky top screen (300px LCD + bezel padding);
 * from `sm` up the list scrolls inside itself.
 */
export function DexList({
  creatures,
  total,
  selectedId,
  onSelect,
  marksOf,
  revealOf,
  onMore,
}: {
  creatures: Creature[];
  total: number;
  selectedId: number | null;
  onSelect: (dexId: number) => void;
  marksOf: (dexId: number) => VariantMarks | null;
  revealOf: (dexId: number) => DexReveal;
  onMore: () => void;
}) {
  if (total === 0) {
    return <p className="bg-paper p-4 text-center font-pixel text-sm text-paper-ink">No Pokémon match.</p>;
  }
  return (
    <ul aria-label="Pokémon" className="bg-paper font-pixel text-paper-ink sm:max-h-[360px] sm:overflow-y-auto">
      {creatures.map((c) => {
        const marks = marksOf(c.dexId);
        const hidden = revealOf(c.dexId) === 'hidden';
        const caught = marks !== null && caughtAny(marks);
        const seen = marks !== null && !caught && !hidden;
        const on = c.dexId === selectedId;
        return (
          <li key={c.id}>
            <button
              id={`dex-row-${c.dexId}`}
              type="button"
              aria-current={on ? 'true' : undefined}
              onClick={() => onSelect(c.dexId)}
              className={`ui-focus-ink flex h-12 w-full scroll-mt-[320px] items-center gap-2 border-b border-dashed border-paper-ink/20 pr-2 text-left sm:scroll-mt-0 ${
                on ? 'bg-select' : 'hover:bg-select/30'
              }`}
            >
              <span className="w-10 shrink-0 pl-2 font-label text-[10px]">{paddedDexNo(c.dexId)}</span>
              <span className="h-12 w-16 shrink-0 overflow-hidden">
                <PixelSprite sheet src={c.mini} size={64} alt="" silhouette={hidden} className="-mt-3" />
              </span>
              <span className="w-3 shrink-0">
                {caught && <PixelIcon name="ball" size={12} label="Caught" />}
                {seen && <PixelIcon name="eye" size={12} label="Seen" />}
              </span>
              <span className={`min-w-0 flex-1 truncate text-sm ${hidden ? 'text-paper-ink/75' : ''}`}>
                {hidden ? '???' : c.name}
              </span>
              {marks && <CollectionPips marks={marks} />}
            </button>
          </li>
        );
      })}
      {total > creatures.length && (
        <li>
          <button
            type="button"
            onClick={onMore}
            className="ui-focus-ink w-full py-2 font-label text-[10px] uppercase hover:bg-select/30"
          >
            ▼ More ({total - creatures.length})
          </button>
        </li>
      )}
    </ul>
  );
}
