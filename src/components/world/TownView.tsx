import { placeById, placeTitle, routeById, type PlayableId } from '../../game/world';
import {
  TOWN_ART,
  TOWN_DESTINATIONS,
  townDestinationById,
  type TownDestination,
  type TownDestinationId,
  type TownLink,
} from '../../game/town';

// Hearth Town from the inside: the town art with a numbered marker on each of
// its eight destinations, the same eight as a menu, and the selected one's
// card. The Center, library and daycare open the party, Pokédex and box; the
// north road leads to Sunny Meadow. Nothing here writes game state. The route
// screen draws the header (◀ Map, the town's name, Bag) above it.

/** The screens a destination opens (the rest of TownLink are places). */
export type TownService = Exclude<TownLink, PlayableId | 'market'>;
/** The places a destination leads to. */
export type TownRoad = Exclude<TownLink, TownService | 'market'>;

// The town art is a painted illustration, not a native-size tileset, and a phone
// always shows it scaled down (about 0.2–0.75 of its pixels at 320–430 px, DPR
// 1–3). Smooth scaling keeps roofs and fences whole there; pixelated aliases them.
const MAP = `${import.meta.env.BASE_URL}${TOWN_ART.map}`;
const AVATAR = `${import.meta.env.BASE_URL}${TOWN_ART.avatar}`;

const KIND_LABEL: Record<TownDestination['kind'], string> = {
  service: 'Service',
  'public-space': 'Public space',
  exit: 'Exit',
};

const ACTION_LABEL: Record<TownLink, string> = {
  party: 'Open your party',
  dex: 'Open the Pokédex',
  box: 'Open your box',
  market: 'Enter the market',
  r1: `Walk to ${routeById('r1')?.name ?? 'Route 1'}`,
};

/** A source-pixel coordinate as a percentage of the art, so the overlay scales with the image. */
function pct(value: number, of: number): string {
  return `${(value / of) * 100}%`;
}

/** The town's 256 px menu avatar, drawn smooth like the map. `alt=""`: the name is printed beside it. */
export function TownAvatar({ className }: { className: string }) {
  return <img src={AVATAR} alt="" width={256} height={256} className={`shrink-0 [image-rendering:auto] ${className}`} />;
}

/** Hearth Town selected on the world map: its avatar beside its name and description, and the way in. */
export function TownSummary({ onEnter }: { onEnter: () => void }) {
  const home = placeById('home');
  if (!home) return null;
  return (
    <section className="ui-window m-2 p-3">
      <div className="flex items-start gap-3">
        <TownAvatar className="h-24 w-24 min-[400px]:h-32 min-[400px]:w-32" />
        <div className="min-w-0 flex-1">
          <h2 className="font-label text-[11px] uppercase text-info">{placeTitle(home)}</h2>
          <p className="mt-2 text-sm text-ink-dim">{home.blurb}</p>
        </div>
      </div>
      <button type="button" onClick={onEnter} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[11px] uppercase">
        Enter {home.name}
      </button>
    </section>
  );
}

function Marker({ place, active, onSelect }: { place: TownDestination; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      // The name starts with the number the marker shows (WCAG 2.5.3, label in name).
      aria-label={`${place.number} ${place.name}`}
      aria-pressed={active}
      // 44×44 hit area centred on the anchor; the drawn marker inside is smaller.
      className={`ui-focus absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[3px] focus-visible:shadow-[0_0_0_4px_var(--color-edge)] ${active ? 'z-20' : 'z-10'}`}
      style={{ left: pct(place.anchor.x, TOWN_ART.width), top: pct(place.anchor.y, TOWN_ART.height) }}
    >
      <span
        aria-hidden="true"
        className={`grid h-6 w-6 place-items-center rounded-[3px] border-2 border-edge font-label text-[10px] leading-none shadow-[2px_2px_0_var(--color-edge)] ${
          active ? 'bg-accent text-edge' : 'bg-window text-ink'
        }`}
      >
        {place.number}
      </span>
    </button>
  );
}

export function TownView({
  spot,
  onSpot,
  onOpen,
  onWalk,
  onMarket,
}: {
  spot: TownDestinationId;
  onSpot: (id: TownDestinationId) => void;
  /** The Center, library and daycare: the party editor, Pokédex or box. */
  onOpen: (screen: TownService) => void;
  /** The north road: that place's own screen. */
  onWalk: (place: TownRoad) => void;
  /** The Village market: the shop screen. */
  onMarket: () => void;
}) {
  const current = townDestinationById(spot) ?? TOWN_DESTINATIONS[0];
  const { bounds } = current;
  const link = current.link;
  const first = TOWN_DESTINATIONS[0].number;
  const last = TOWN_DESTINATIONS[TOWN_DESTINATIONS.length - 1].number;

  const act = (to: TownLink) => {
    if (to === 'market') onMarket();
    else if (to === 'party' || to === 'dex' || to === 'box') onOpen(to);
    else onWalk(to);
  };

  return (
    <>
      <section aria-label="Town map" className="ui-window m-2 p-1">
        {/* Image and markers share one box, so the markers stay on their buildings at any width. */}
        <div className="relative aspect-[3/2] w-full rounded-[3px] bg-slot">
          <img
            src={MAP}
            alt=""
            width={TOWN_ART.width}
            height={TOWN_ART.height}
            draggable={false}
            decoding="async"
            className="absolute inset-0 block h-full w-full select-none rounded-[3px] [image-rendering:auto]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-[3px] border-2 border-accent bg-accent/15 shadow-[0_0_0_1px_var(--color-edge)]"
            style={{
              left: pct(bounds.x, TOWN_ART.width),
              top: pct(bounds.y, TOWN_ART.height),
              width: pct(bounds.width, TOWN_ART.width),
              height: pct(bounds.height, TOWN_ART.height),
            }}
          />
          {TOWN_DESTINATIONS.map((place) => (
            <Marker key={place.id} place={place} active={place.id === current.id} onSelect={() => onSpot(place.id)} />
          ))}
        </div>
      </section>

      <section aria-labelledby="town-places-heading" className="ui-window m-2 mt-4 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 id="town-places-heading" className="font-label text-[11px] uppercase text-info">
            Places to visit
          </h2>
          <span className="font-label text-[9px] uppercase text-ink-dim">
            {first}–{last}
          </span>
        </div>
        <ol className="grid grid-cols-2 gap-1">
          {TOWN_DESTINATIONS.map((place) => {
            const active = place.id === current.id;
            return (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => onSpot(place.id)}
                  aria-label={`${place.number} ${place.name}`}
                  aria-pressed={active}
                  className={`ui-focus flex min-h-11 w-full items-center gap-1.5 rounded-[3px] px-1.5 py-1 text-left ${active ? 'bg-button' : 'bg-slot'}`}
                >
                  <span aria-hidden="true" className={`w-2.5 shrink-0 font-label text-[10px] ${active ? 'text-accent' : 'text-transparent'}`}>
                    ▶
                  </span>
                  <span aria-hidden="true" className={`shrink-0 font-label text-[9px] ${active ? 'text-accent' : 'text-ink-dim'}`}>
                    {place.number}
                  </span>
                  <span className="min-w-0 text-xs leading-tight">{place.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="town-place-name" aria-live="polite" className="ui-window m-2 mt-4 p-3">
        <p className="font-label text-[10px] uppercase text-info">
          {current.number} / {KIND_LABEL[current.kind]}
        </p>
        <h2 id="town-place-name" className="mt-1 text-lg leading-tight">
          {current.name}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">{current.description}</p>
        <p className="mt-2 text-sm leading-relaxed">{current.role}</p>
        {link ? (
          <button
            type="button"
            onClick={() => act(link)}
            className="ui-button-primary ui-focus mt-3 min-h-12 w-full font-label text-[11px] uppercase"
          >
            {ACTION_LABEL[link]}
          </button>
        ) : current.kind === 'service' ? (
          <p className="mt-3 border-t border-window-frame pt-2 text-sm text-ink-dim">Opens in a later update.</p>
        ) : null}
      </section>
    </>
  );
}
