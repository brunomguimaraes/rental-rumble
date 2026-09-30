import { useState } from 'react';
import type { OwnedMon } from '../../game/box';
import { miniUrl, portraitUrl, spriteUrl } from '../../game/pokemon';
import type { ActivityResult } from '../../game/activity';
import { formatLevel, routeById } from '../../game/world';
import { PixelSprite } from '../ui/PixelSprite';
import { ExpMeter } from './ExpMeter';
import { PixelIcon } from './PixelIcon';
import { OUTCOME_TITLE, POKEBALL, formatDuration, growthLines, monName, speciesName } from './scene';

// What a trip or a training session paid out. It stays until dismissed, so a
// closed tab or a lost response never loses it.

const BATTLES_SHOWN = 10;

export function ResultsView({
  result,
  box,
  busy,
  onMap,
  onAgain,
}: {
  result: ActivityResult;
  box: OwnedMon[];
  busy: boolean;
  onMap: () => void;
  onAgain: () => void;
}) {
  const [allBattles, setAllBattles] = useState(false);
  const route = routeById(result.locationId);
  const byId = new Map(box.map((m) => [m.id, m]));
  const evolution = result.members.find((m) => m.evolutions.length > 0);
  const unlocked = result.unlocked.map((id) => routeById(id)?.name ?? id);
  const battles = allBattles ? result.battles : result.battles.slice(-BATTLES_SHOWN);
  const again = result.mode === 'train' ? 'Train again' : 'Explore again';

  return (
    <div className="flex flex-col">
      {evolution ? (
        <section className="ui-window m-2 p-3 text-center" aria-labelledby="hero-title">
          <h2 id="hero-title" className="font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">
            {speciesName(evolution.before.dexId)} evolved!
          </h2>
          <div className="mt-2 flex items-center justify-center gap-3">
            <PixelSprite src={spriteUrl(evolution.before.dexId)} fallback={POKEBALL} size={96} alt={speciesName(evolution.before.dexId)} />
            <span aria-hidden="true" className="font-label text-lg text-accent">
              ▶
            </span>
            <PixelSprite src={spriteUrl(evolution.after.dexId)} fallback={POKEBALL} size={96} alt={speciesName(evolution.after.dexId)} />
          </div>
          <p className="mt-1 font-label text-[10px] uppercase">
            {speciesName(evolution.after.dexId)} · {formatLevel(evolution.after)}
          </p>
        </section>
      ) : result.firstClear ? (
        <section className="ui-window m-2 p-3 text-center" aria-labelledby="hero-title">
          <h2 id="hero-title" className="font-label text-sm uppercase text-accent [text-shadow:2px_2px_0_#000]">
            {route?.name ?? 'Route'} cleared!
          </h2>
          {unlocked.length > 0 && <p className="mt-2 text-sm">New places on the map: {unlocked.join(' and ')}.</p>}
        </section>
      ) : null}

      <section className="ui-window m-2 p-3" aria-labelledby="summary-title">
        <div className="flex items-center justify-between gap-2">
          <h2 id="summary-title" className="font-label text-[11px] uppercase text-info">
            {OUTCOME_TITLE[result.outcome]}
          </h2>
          <span className="flex items-center gap-1 font-label text-[9px] uppercase">
            <PixelIcon name="star" size={10} className="text-accent" />
            {result.wins} {result.wins === 1 ? 'battle' : 'battles'} won
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-dim">
          {route?.name ?? 'Out'} · {formatDuration(result.elapsedMs)}
          {result.outcome === 'early' && result.battles.length === 0 ? ' · back before the first battle' : ''}
          {result.legacy ? ' · a session from before the map' : ''}
        </p>
        {!evolution && result.firstClear === false && result.cleared && (
          <p className="mt-2 text-sm">Guardian beaten again: +{route?.explore.clearBonus ?? 0} EXP bonus.</p>
        )}
        {result.firstClear && evolution && unlocked.length > 0 && (
          <p className="mt-2 text-sm">New places on the map: {unlocked.join(' and ')}.</p>
        )}

        <ol className="mt-3 flex flex-col gap-2">
          {result.members.map((member) => {
            const now = byId.get(member.id);
            const lines = growthLines(member);
            return (
              <li key={member.id} className="flex items-center gap-2 rounded-[3px] bg-slot p-1.5">
                <PixelSprite src={portraitUrl(member.after.dexId)} fallback={POKEBALL} size={40} alt="" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{now ? monName(now) : speciesName(member.after.dexId)}</span>
                    <span className="shrink-0 font-label text-[9px] uppercase text-exp">+{member.expGained} EXP</span>
                  </div>
                  <div className="font-label text-[9px] uppercase text-ink-dim">
                    {formatLevel(member.before)}
                    {member.after.level !== member.before.level ? ` → ${formatLevel(member.after)}` : ''}
                    {member.sharePct < 100 ? ` · ${member.sharePct}% share` : ''}
                  </div>
                  <div className="mt-1 flex">
                    <ExpMeter level={member.after.level} exp={member.after.exp} />
                  </div>
                  {lines.length > 0 && <p className="mt-1 text-xs text-accent">{lines.join(' · ')}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        {result.members.length === 0 && <p className="mt-2 text-sm text-ink-dim">No one from that party is in your box any more.</p>}
      </section>

      {(result.newSeen.length > 0 || result.newLandmarks.length > 0) && (
        <section className="ui-window m-2 p-3" aria-labelledby="found-title">
          <h2 id="found-title" className="mb-2 flex items-center gap-1.5 font-label text-[11px] uppercase text-info">
            <PixelIcon name="book" size={12} /> New discoveries
          </h2>
          {result.newSeen.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {result.newSeen.map((dexId) => (
                <li key={dexId} className="flex w-16 flex-col items-center rounded-[3px] bg-slot py-1">
                  <PixelSprite src={portraitUrl(dexId)} fallback={POKEBALL} size={40} alt="" />
                  <span className="w-full truncate px-0.5 text-center text-xs">{speciesName(dexId)}</span>
                </li>
              ))}
            </ul>
          )}
          {result.newLandmarks.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {result.newLandmarks.map((id) => (
                <li key={id}>{route?.landmarks.find((l) => l.id === id)?.name ?? id}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {result.battles.length > 0 && (
        <section className="ui-window m-2 p-3" aria-labelledby="battles-title">
          <h2 id="battles-title" className="mb-2 font-label text-[11px] uppercase text-info">
            Battles
          </h2>
          <ol className="flex flex-col gap-1 text-sm">
            {battles.map((b, i) => (
              <li key={i} className="flex items-center gap-2">
                <PixelSprite src={miniUrl(b.foe.dexId)} size={64} alt="" sheet className="-my-3" />
                <span className="min-w-0 flex-1 truncate">
                  {b.foe.guardian ? 'Guardian ' : ''}
                  {speciesName(b.foe.dexId)} <span className="font-label text-[9px] uppercase text-ink-dim">{formatLevel(b.foe)}</span>
                </span>
                <span className={`font-label text-[9px] uppercase ${b.won ? 'text-exp' : 'text-accent'}`}>{b.won ? 'Won' : 'Lost'}</span>
              </li>
            ))}
          </ol>
          {result.battles.length > BATTLES_SHOWN && (
            <button type="button" onClick={() => setAllBattles((v) => !v)} className="ui-button ui-focus mt-2 min-h-11 px-3 font-label text-[9px] uppercase">
              {allBattles ? 'Show the latest' : `Show all ${result.battles.length}`}
            </button>
          )}
        </section>
      )}

      <div className="m-2 mt-3 grid grid-cols-2 gap-3">
        <button type="button" disabled={busy} onClick={onAgain} className="ui-button ui-focus min-h-12 font-label text-[10px] uppercase">
          {again}
        </button>
        <button type="button" disabled={busy} onClick={onMap} className="ui-button-primary ui-focus min-h-12 font-label text-[10px] uppercase">
          Back to map
        </button>
      </div>
    </div>
  );
}
