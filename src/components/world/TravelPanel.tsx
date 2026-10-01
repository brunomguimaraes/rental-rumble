import type { RouteState } from '../../game/route-actions';
import { placeById, placeTitle } from '../../game/world';
import { useServerClock } from '../ui/useServerClock';
import { travelBlock } from './route-copy';

/** A place the trainer is not at: what it is, what the trip costs, and why it can't start yet. */
export function TravelPanel({ to, state, busy, onTravel }: { to: 'home' | 'r1'; state: RouteState; busy: boolean; onTravel: (to: 'home' | 'r1') => void }) {
  const now = useServerClock(state.serverNow);
  const place = placeById(to);
  const quote = state.quotes.find((q) => q.to === to) ?? null;
  const blocked = travelBlock({ quote, travel: state.travel, encounterOpen: state.activeEvent !== null, now });
  if (!place) return null;
  return (
    <section className="ui-window m-2 p-3">
      <h2 className="mb-2 font-label text-[11px] uppercase text-info">{placeTitle(place)}</h2>
      <p className="text-sm text-ink-dim">{place.blurb}</p>
      {quote && <p className="mt-2 text-sm">{quote.via ? `Riding ${quote.via}: ${quote.cost} travel (walking is ${quote.walk}).` : `Walking: ${quote.cost} travel.`}</p>}
      <button type="button" disabled={busy || blocked !== null} onClick={() => onTravel(to)} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[11px] uppercase">
        {quote ? `Travel · ${quote.cost}${quote.via ? ` (${quote.via})` : ''}` : 'Travel'}
      </button>
      {blocked && <p className="mt-2 text-sm text-ink-dim">{blocked}</p>}
    </section>
  );
}
