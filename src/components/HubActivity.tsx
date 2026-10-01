import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { portraitUrl } from '../game/pokemon';
import type { RouteState } from '../game/route-actions';
import { PixelSprite } from './ui/PixelSprite';
import { LocationScene } from './world/LocationScene';
import { placeHighlights } from './world/place-highlights';
import type { WorldEntry } from './world/RouteScreen';

/** Home starts with a place and its news; spending actions happens inside the meadow. */
export function HubActivity({ world, worldError, location, lead, onVisit, onRetry }: {
  world: RouteState | null;
  worldError: string | null;
  location: 'home' | 'r1';
  lead?: OwnedMon;
  onVisit: (entry: WorldEntry) => void;
  onRetry: () => void;
}) {
  const town = location === 'home';
  const highlights = world ? placeHighlights(world) : [];
  const companion = lead ? ownedMonToCreature(lead) : null;
  const enter = () => onVisit(town ? { place: 'home', spot: 'town-square' } : { place: 'r1' });

  return <section aria-label="Your location" className="space-y-4">
    <div className="ui-window">
      <LocationScene place={location} footer={<div>
        <p className="font-label text-[8px] uppercase tracking-widest text-info">Hearthvale</p>
        <h1 className="mt-1 font-pixel text-2xl text-ink">{town ? 'Hearth Town' : 'Sunny Meadow'}</h1>
      </div>}>
        {companion && <div className={`pointer-events-none absolute ${town ? 'bottom-[30%] left-[46%]' : 'bottom-[29%] left-[54%]'}`}>
          <PixelSprite src={companion.mini} size={64} sheet alt={`${lead?.nickname ?? companion.name} is with you`} />
        </div>}
      </LocationScene>
      <div className="border-t-2 border-window-frame p-3">
        <p className="text-sm text-ink-dim">{town ? 'A familiar face around every corner.' : 'Tall grass. New faces. Your next discovery.'}</p>
        <button type="button" onClick={enter} className="ui-button-primary ui-focus mt-2 flex min-h-12 w-full items-center justify-center gap-3 px-3 font-label text-[11px] uppercase">
          <span aria-hidden="true">▶</span>{town ? 'Explore the town' : 'Explore the meadow'}
        </button>
      </div>
    </div>

    {worldError ? <div role="alert" className="ui-window flex items-center gap-3 p-3 text-sm">
      <div className="min-w-0 flex-1"><p className="text-accent">Couldn’t refresh local news</p><p className="text-ink-dim">{worldError}</p></div>
      <button type="button" onClick={onRetry} className="ui-button ui-focus min-h-11 px-3 font-label text-[9px] uppercase">Retry</button>
    </div> : !world ? <p role="status" className="ui-window p-3 text-sm text-ink-dim">Looking around Hearthvale…</p> : highlights.length > 0 ? <div aria-label={town ? 'Nearby in Sunny Meadow' : 'Around Sunny Meadow'} className="space-y-3">
      <p className="px-1 font-label text-[9px] uppercase tracking-wide text-info">{town ? 'Nearby · Sunny Meadow' : 'Around you'}</p>
      {highlights.map((highlight) => <button key={highlight.kind} type="button" onClick={() => onVisit({ place: 'r1', focus: highlight.focus })}
        className="ui-window ui-focus flex min-h-20 w-full items-center gap-3 p-3 text-left">
        {highlight.dexId ? <PixelSprite src={portraitUrl(highlight.dexId)} size={40} alt="" />
          : highlight.spriteKey ? <img src={`${import.meta.env.BASE_URL}sprites/trainers/${highlight.spriteKey}.png`} alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]" />
            : <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center border border-window-rim bg-slot text-xl text-accent">{highlight.kind === 'quest' ? '!' : '✦'}</span>}
        <span className="min-w-0 flex-1"><span className="block font-label text-[10px] uppercase text-accent">{highlight.label}</span><span className="mt-1 block text-sm leading-snug text-ink-dim">{highlight.detail}</span></span>
        <span aria-hidden="true" className="text-info">›</span>
      </button>)}
    </div> : <div className="ui-window p-3 text-sm"><p className="text-ink">A good day to wander.</p><p className="mt-1 text-ink-dim">Your survey is complete. There are still Pokémon to meet along the meadow trail.</p></div>}

    <button type="button" onClick={() => onVisit(town ? { place: 'r1' } : { place: 'home', spot: 'town-square' })}
      className="ui-button ui-focus flex min-h-11 w-full items-center justify-between gap-2 px-3 text-sm">
      <span>{town ? 'Take the road to Sunny Meadow' : 'Walk back to Hearth Town'}</span><span aria-hidden="true" className="text-accent">→</span>
    </button>
  </section>;
}
