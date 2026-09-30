import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { MAX_LEVEL } from '../game/levels';
import { PixelSprite } from './ui/PixelSprite';

const PARTY_SIZE = 6;

/** A collection preview until the game has a saved party selection. */
export function HubParty({ box, onViewBox }: { box: OwnedMon[]; onViewBox: () => void }) {
  const recent = box.slice(0, PARTY_SIZE).map((mon) => ({ mon, creature: ownedMonToCreature(mon) }));
  const shown = recent.filter(({ creature }) => creature !== null).length;

  return (
    <section aria-labelledby="hub-party-heading" className="ui-window mt-8 w-full max-w-[520px] self-center p-2 font-pixel">
      <div className="mb-2 flex min-h-11 items-center justify-between gap-2 px-1">
        <h2 id="hub-party-heading" className="font-label text-[11px] uppercase tracking-wide text-info">
          Your party
        </h2>
        <button
          type="button"
          onClick={onViewBox}
          className="ui-button ui-focus min-h-11 px-2 font-label text-[9px] uppercase hover:text-accent"
        >
          View box <span aria-hidden="true">›</span>
        </button>
      </div>

      <ol aria-label="Party preview" className="grid grid-cols-6 gap-0.5 min-[360px]:gap-1.5">
        {Array.from({ length: PARTY_SIZE }, (_, index) => {
          const entry = recent[index];
          const creature = entry?.creature;
          return (
            <li key={entry?.mon.id ?? `empty-${index}`} className="min-w-0 text-center">
              <div
                title={creature?.name}
                className={`relative grid h-14 place-items-center rounded-[3px] border bg-slot ${creature ? 'border-window-rim' : 'border-dashed border-window-frame'}`}
              >
                {creature ? (
                  <>
                    <PixelSprite
                      src={creature.portrait}
                      fallback={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
                      size={40}
                      alt={creature.name}
                    />
                    {creature.shiny && (
                      <span className="absolute -right-0.5 -top-1 text-xs text-caught-shiny">
                        <span aria-hidden="true">✦</span><span className="sr-only">Shiny</span>
                      </span>
                    )}
                    {creature.altColor && (
                      <span className="absolute -right-0.5 -top-1 text-xs text-caught-alt">
                        <span aria-hidden="true">◆</span><span className="sr-only">Alt colour</span>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-window-frame" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M3 12h6m6 0h6" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="sr-only">Empty slot {index + 1}</span>
                  </>
                )}
              </div>
              <div className={`mt-1.5 font-label text-[9px] uppercase ${entry && creature && entry.mon.level >= MAX_LEVEL ? 'text-accent' : 'text-ink'}`}>
                {entry && creature ? `Lv.${entry.mon.level}` : <span aria-hidden="true">—</span>}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-window-frame px-1 pt-2 text-xs text-ink-dim">
        <p>{shown ? 'Latest from your box' : 'No Pokémon to display yet.'}</p>
        <span className="font-label text-[9px] uppercase" aria-label={`${shown} of ${PARTY_SIZE} slots filled`}>{shown} / {PARTY_SIZE}</span>
      </div>
    </section>
  );
}
