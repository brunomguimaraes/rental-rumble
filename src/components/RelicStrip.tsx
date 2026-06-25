import type { RelicId } from '../game/types';
import { itemUrl } from '../game/pokemon';
import { RELICS } from '../game/relics';

/**
 * A compact, labelled row of the team's collected relic icons — the run-long
 * passives picked up at item events. Renders nothing when the team holds none,
 * so callers can drop it in unconditionally.
 */
export function RelicStrip({
  relics,
  className = '',
}: {
  relics: RelicId[];
  className?: string;
}) {
  if (relics.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
        Relics
      </span>
      {relics.map((id, i) => {
        const def = RELICS[id];
        return (
          <img
            key={`${id}-${i}`}
            src={itemUrl(def.icon)}
            alt={def.name}
            title={`${def.name} — ${def.description}`}
            className="h-7 w-7 rounded-lg border border-white/10 bg-white/5 object-contain p-0.5 [image-rendering:pixelated]"
          />
        );
      })}
    </div>
  );
}
