import type { ReactNode } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../../game/box';
import { miniUrl, portraitUrl } from '../../game/pokemon';
import type { ActivityMode, PlaceView, WorldState } from '../../game/activity';
import {
  ROUTES,
  expSharePct,
  masteryOf,
  placeTitle,
  rateParty,
  routeById,
  unlockText,
  type RoutePlace,
} from '../../game/world';
import { ExpBar } from '../ui/ExpBar';
import { PixelSprite } from '../ui/PixelSprite';
import { Backdrop } from './Backdrop';
import { PixelIcon } from './PixelIcon';
import { BIOME_LABEL, POKEBALL, STATE_GLYPH, STATE_LABEL, backdropUrl, monName, speciesName } from './scene';

// A route's details: what lives there, what is left to find, how training
// pays, and the two ways in. Everything the player cannot do yet says why.

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="ui-window m-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-label text-[11px] uppercase text-info">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Portrait({ dexId, silhouette = false, size = 40 }: { dexId: number; silhouette?: boolean; size?: number }) {
  return <PixelSprite src={portraitUrl(dexId)} fallback={POKEBALL} size={size} alt="" silhouette={silhouette} />;
}

function MasteryPips({ route, view }: { route: RoutePlace; view: PlaceView }) {
  const m = masteryOf(route, view.progress);
  const pips: [string, boolean][] = [
    ['Cleared', m.cleared],
    ['Surveyed', m.surveyed],
    ['Catalogued', m.catalogued],
  ];
  return (
    <ul className="flex gap-2" aria-label="Mastery">
      {pips.map(([label, done]) => (
        <li key={label} className={`flex items-center gap-1 font-label text-[8px] uppercase ${done ? 'text-accent' : 'text-ink-dim'}`}>
          <PixelIcon name={done ? 'star' : 'starOutline'} size={10} />
          {label}
          <span className="sr-only">{done ? 'done' : 'not yet'}</span>
        </li>
      ))}
    </ul>
  );
}

/** Why the player can't start here right now, and what to do about it. */
function blockedReason(
  view: PlaceView,
  world: WorldState,
  party: readonly OwnedMon[],
  route: RoutePlace,
): { text: string; action: 'resume' | 'party' | null } | null {
  if (view.state === 'undiscovered') return { text: 'Explore nearby to find this place.', action: null };
  if (view.state === 'locked') return { text: unlockText(route), action: null };
  if (world.activity) {
    const where = routeById(world.activity.locationId)?.name ?? 'somewhere';
    return { text: `Your trainer is out at ${where}.`, action: 'resume' };
  }
  if (party.length === 0) return { text: 'Choose your party first.', action: 'party' };
  return null;
}

export function PlacePanel({
  route,
  view,
  world,
  party,
  onBack,
  onChoose,
  onOpenActivity,
  onEditParty,
}: {
  route: RoutePlace;
  view: PlaceView;
  world: WorldState;
  party: OwnedMon[];
  onBack: () => void;
  onChoose: (mode: ActivityMode) => void;
  onOpenActivity: () => void;
  onEditParty: () => void;
}) {
  const hidden = view.state === 'undiscovered';
  const locked = view.state === 'locked';
  const m = masteryOf(route, view.progress);
  const blocked = blockedReason(view, world, party, route);
  const opens = ROUTES.filter((r) => r.unlock.includes(route.id)).map((r) => r.name);
  const shares = party.map((mon) => ({ mon, pct: expSharePct(mon.level, route.recommended) })).filter((s) => s.pct < 100);

  return (
    <div className="pb-8">
      <div className="mb-3 flex items-center gap-3 px-2">
        <button type="button" onClick={onBack} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
          ◀ Map
        </button>
        <h1 className="min-w-0 truncate font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">
          {hidden ? '???' : placeTitle(route)}
        </h1>
      </div>

      {!hidden && (
        <div className="ui-window relative m-2 h-36 overflow-hidden p-0" aria-hidden="true">
          <Backdrop src={backdropUrl(route)} />
        </div>
      )}

      <Section title={hidden ? 'Unknown place' : BIOME_LABEL[route.biome]}>
        <p className="text-sm leading-relaxed">{hidden ? 'Somewhere beyond the places you know.' : route.blurb}</p>
        <p className="mt-2 flex items-center gap-2 text-sm">
          <PixelIcon name={STATE_GLYPH[view.state]} size={14} className={view.state === 'completed' ? 'text-accent' : 'text-ink'} />
          <span className="font-label text-[10px] uppercase">{STATE_LABEL[view.state]}</span>
          {(locked || hidden) && <span className="text-ink-dim">{hidden ? 'Explore nearby to find it.' : unlockText(route)}</span>}
        </p>
        {!hidden && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-window-frame pt-2">
            <span className="flex items-center gap-1 font-label text-[9px] uppercase">
              <PixelIcon name="eye" size={12} /> {m.seenCount} / {m.speciesTotal} seen
            </span>
            <span className="flex items-center gap-1 font-label text-[9px] uppercase">
              <PixelIcon name="book" size={12} /> {m.landmarksFound} / {m.landmarksTotal} landmarks
            </span>
            <MasteryPips route={route} view={view} />
          </div>
        )}
      </Section>

      {!hidden && (
        <Section title="Local Pokémon">
          <ul className="grid grid-cols-4 gap-1.5 min-[400px]:grid-cols-5">
            {route.wild.pool.map((entry) => {
              const seen = view.progress.seen.includes(entry.dexId);
              const name = seen ? speciesName(entry.dexId) : 'Not seen yet';
              return (
                <li key={entry.dexId} className="relative grid place-items-center rounded-[3px] bg-slot" title={name}>
                  <PixelSprite src={miniUrl(entry.dexId)} size={64} alt="" sheet silhouette={!seen || locked} />
                  <span className="sr-only">
                    {name}
                    {entry.rare ? ', rare' : ''}
                  </span>
                  {entry.rare && (
                    <span className="absolute right-0.5 top-0.5 text-caught-shiny">
                      <PixelIcon name="sparkle" size={10} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {!hidden && !locked && (
        <Section title="Landmarks">
          <ul className="flex flex-col gap-1 text-sm">
            {route.landmarks.map((l) => {
              const found = view.progress.landmarks.includes(l.id);
              return (
                <li key={l.id} className="flex items-start gap-2">
                  <PixelIcon name="book" size={12} className={`mt-1 ${found ? 'text-accent' : 'text-ink-dim'}`} />
                  <span>
                    <span className={found ? 'text-ink' : 'text-ink-dim'}>{found ? l.name : '???'}</span>
                    {found && <span className="block text-xs text-ink-dim">{l.blurb}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {!hidden && !locked && (
        <Section title="Guardian">
          <div className="flex items-center gap-3">
            <Portrait dexId={route.guardian.dexId} />
            <div className="text-sm">
              <div>
                {speciesName(route.guardian.dexId)}
              </div>
              <div className="text-xs text-ink-dim">
                {view.progress.clearedAt !== null
                  ? 'Beaten. Clear it again for bonus EXP.'
                  : opens.length > 0
                    ? `Beat it at the end of an expedition to open ${opens.join(' and ')}.`
                    : 'Beat it at the end of an expedition.'}
              </div>
            </div>
          </div>
        </Section>
      )}

      {!hidden && !locked && (
        <Section title="Rewards">
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              Training: one battle every {Math.round(route.training.paceMs / 60000)} min for up to 8 hours, {route.training.expPerWin} EXP per win.
            </li>
            <li>
              Exploring: {route.explore.expPerWin} EXP per win, +{route.explore.clearBonus} for beating the guardian.
            </li>
            {shares.length > 0 && (
              <li className="text-ink-dim">
                Strong Pokémon earn less EXP here:{' '}
                {shares.map((s) => `${monName(s.mon)} earns ${s.pct}%`).join(', ')}.
              </li>
            )}
          </ul>
        </Section>
      )}

      <div className="m-2 mt-4 flex flex-col gap-3">
        {blocked && (
          <p className="flex items-center justify-between gap-3 text-sm text-ink-dim" role="note">
            <span>{blocked.text}</span>
            {blocked.action === 'resume' && (
              <button type="button" onClick={onOpenActivity} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">
                Resume
              </button>
            )}
            {blocked.action === 'party' && (
              <button type="button" onClick={onEditParty} className="ui-button ui-focus min-h-11 shrink-0 px-3 font-label text-[10px] uppercase">
                Edit party
              </button>
            )}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={blocked !== null}
            onClick={() => onChoose('explore')}
            className="ui-button-primary ui-focus flex min-h-16 flex-col items-center justify-center gap-0.5 px-2"
          >
            <span className="flex items-center gap-1.5 font-label text-[12px] uppercase">
              <PixelIcon name="boot" size={14} /> Explore
            </span>
            <span className="text-xs">Choose your path</span>
          </button>
          <button
            type="button"
            disabled={blocked !== null}
            onClick={() => onChoose('train')}
            className="ui-button ui-focus flex min-h-16 flex-col items-center justify-center gap-0.5 px-2"
          >
            <span className="flex items-center gap-1.5 font-label text-[12px] uppercase">
              <PixelIcon name="exp" size={14} className="text-exp" /> Train here
            </span>
            <span className="text-xs text-ink-dim">
              {route.training.expPerWin} EXP / win · {Math.round(route.training.paceMs / 60000)} min
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

const RATING_TEXT = {
  comfortable: 'Your party outclasses this place.',
  even: 'A fair match for your party.',
  risky: 'Your party is not ready for this place yet.',
} as const;

/** Last look before setting out: the party, how it matches up, and what happens. */
export function StartConfirm({
  route,
  mode,
  party,
  busy,
  error,
  onStart,
  onCancel,
}: {
  route: RoutePlace;
  mode: ActivityMode;
  party: OwnedMon[];
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onCancel: () => void;
}) {
  const rating = rateParty(
    party.map((m) => m.level),
    route.recommended,
  );
  const minutes = Math.round(route.training.paceMs / 60000);
  return (
    <div className="pb-8">
      <div className="mb-3 flex items-center gap-3 px-2">
        <button type="button" onClick={onCancel} className="ui-button ui-focus min-h-11 px-3 font-label text-[10px] uppercase">
          ◀ Back
        </button>
        <h1 className="min-w-0 truncate font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">
          {mode === 'explore' ? `Explore ${route.name}` : `Train at ${route.name}`}
        </h1>
      </div>

      <Section title="Your party">
        <ol className="flex flex-wrap gap-2">
          {party.map((mon, i) => {
            const creature = ownedMonToCreature(mon);
            return (
              <li key={mon.id} className="flex w-14 flex-col items-center rounded-[3px] bg-slot py-1">
                <PixelSprite src={creature?.portrait ?? POKEBALL} fallback={POKEBALL} size={40} alt="" />
                <span className="w-full truncate px-0.5 text-center text-xs">{monName(mon)}</span>
                {i === 0 && <span className="font-label text-[8px] uppercase text-accent">Lead</span>}
                <ExpBar level={mon.level} exp={mon.exp} />
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm">
          <span className={`font-label text-[10px] uppercase ${rating === 'risky' ? 'text-accent' : 'text-info'}`}>{rating}</span>{' '}
          {RATING_TEXT[rating]}
        </p>
      </Section>

      <Section title="What happens">
        {mode === 'explore' ? (
          <p className="text-sm leading-relaxed">
            About five checkpoints: sightings, landmarks, battles, and a fork where you pick the way. The guardian waits at the
            end. Lose a battle and the trip ends; you keep the EXP you earned. You can head home at any checkpoint.
          </p>
        ) : (
          <p className="text-sm leading-relaxed">
            Your party battles here while you are away: one battle every {minutes} min for up to 8 hours. Training stops at the
            first defeat. EXP is applied when you bring them home.
          </p>
        )}
      </Section>

      <div className="m-2 mt-4 flex flex-col gap-3">
        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="ui-button ui-focus min-h-12 font-label text-[11px] uppercase">
            Not now
          </button>
          <button
            type="button"
            disabled={busy || party.length === 0}
            onClick={onStart}
            className="ui-button-primary ui-focus min-h-12 font-label text-[11px] uppercase"
          >
            {busy ? 'Setting out…' : mode === 'explore' ? 'Set out' : 'Start training'}
          </button>
        </div>
      </div>
    </div>
  );
}
