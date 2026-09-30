import { useEffect, useRef, useState } from 'react';
import { ownedMonToCreature } from '../../game/box';
import { miniUrl, portraitUrl } from '../../game/pokemon';
import type { PublicActivity } from '../../game/activity';
import { formatLevel, routeById, trainingBattleCount } from '../../game/world';
import { finishActivity } from '../../game/world-client';
import { PixelSprite } from '../ui/PixelSprite';
import { StatBar } from '../ui/StatBar';
import { ExpMeter } from './ExpMeter';
import { Backdrop } from './Backdrop';
import { PixelIcon } from './PixelIcon';
import { POKEBALL, TRAINER, backdropUrl, formatDuration, monName, speciesName, type ActivityPatch } from './scene';

// Training in progress. The clock follows the server; the tally is what the
// server has resolved so far. Nothing is paid until the trainer comes home.

export function TrainingView({
  activity,
  serverOffsetMs,
  onPatch,
  onRefresh,
  onLeave,
  onExpired,
}: {
  activity: PublicActivity;
  serverOffsetMs: number;
  onPatch: (patch: ActivityPatch) => void;
  onRefresh: () => Promise<void>;
  onLeave: () => void;
  onExpired: () => void;
}) {
  const route = routeById(activity.locationId);
  const t = activity.training;
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRefresh = useRef(Date.now());
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = t ? Math.max(0, Math.min(now + serverOffsetMs - activity.startedAt, t.capMs)) : 0;
  const slotsNow = t ? trainingBattleCount(elapsed, t, t.capMs) : 0;
  const finished = Boolean(t && (t.fell || t.capped));

  // A battle is due that the server hasn't resolved for us yet: ask again (not more than every 20 s).
  useEffect(() => {
    if (!t || finished || slotsNow <= t.battles) return;
    if (Date.now() - lastRefresh.current < 20_000) return;
    lastRefresh.current = Date.now();
    void onRefresh();
  }, [slotsNow, t, finished, onRefresh]);

  if (!route || !t) return null;
  const nextIn = finished ? null : (Math.floor(elapsed / t.paceMs) + 1) * t.paceMs - elapsed;
  const pendingOf = new Map(t.pendingExp.map((p) => [p.id, p.exp]));

  const bringHome = async () => {
    setBusy(true);
    setError(null);
    const res = await finishActivity(activity.id);
    setBusy(false);
    if (!res.ok) {
      if (res.expired) return onExpired();
      setError(res.error);
      return;
    }
    onPatch({ activity: null, result: res.result, box: res.box });
    void onRefresh();
  };

  return (
    <div className="flex flex-col">
      <div className="ui-window relative m-2 h-48 overflow-hidden p-0" aria-hidden="true">
        <Backdrop src={backdropUrl(route)} />
        <div className={`absolute bottom-2 left-3 flex items-end gap-0.5 ${reduced || finished ? '' : 'animate-world-bob'}`}>
          <img src={reduced || finished ? TRAINER.still : TRAINER.walk} alt="" width={32} height={48} className="[image-rendering:pixelated]" />
          {activity.party.map((mon) => (
            <PixelSprite key={mon.id} src={miniUrl(mon.dexId)} size={64} alt="" sheet className={reduced || finished ? '' : 'animate-world-walk'} />
          ))}
        </div>
      </div>

      <section className="ui-window m-2 p-3" aria-labelledby="progress-title">
        <div className="flex items-center justify-between gap-2">
          <h2 id="progress-title" className="font-label text-[11px] uppercase text-info">
            Training progress
          </h2>
          <span className="flex items-center gap-1 font-label text-[10px] uppercase">
            <PixelIcon name="clock" size={12} />
            <span>
              {formatDuration(elapsed)} / 8h
            </span>
          </span>
        </div>
        <div className="mt-2 flex">
          <StatBar value={elapsed} max={t.capMs} tone="night" label={`${formatDuration(elapsed)} of 8 hours`} segments={16} />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="font-label text-[12px]">{t.wins}</span> {t.wins === 1 ? 'win' : 'wins'}
          </span>
          <span className="text-ink-dim">{t.battles} {t.battles === 1 ? 'battle' : 'battles'} resolved</span>
        </p>
        <p className="mt-1 text-sm" aria-live="polite">
          {t.fell
            ? `Your party fell at battle ${t.battles}. Bring them home to collect.`
            : t.capped
              ? '8 hours reached. Bring them home to collect.'
              : nextIn !== null
                ? `Next battle in ${formatDuration(nextIn)}.`
                : ''}
        </p>
        <p className="mt-1 text-xs text-ink-dim">Counts come from the server. Training stops at the first defeat.</p>
      </section>

      <section className="ui-window m-2 p-3" aria-labelledby="party-title">
        <h2 id="party-title" className="mb-2 font-label text-[11px] uppercase text-info">
          Party out training
        </h2>
        <ol className="flex flex-col gap-2">
          {activity.party.map((mon) => {
            const c = ownedMonToCreature(mon);
            return (
              <li key={mon.id} className="flex items-center gap-2 rounded-[3px] bg-slot p-1.5">
                <PixelSprite src={c?.portrait ?? portraitUrl(mon.dexId)} fallback={POKEBALL} size={40} alt="" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {monName(mon)} <span className="font-label text-[9px] uppercase text-ink-dim">{formatLevel(mon)}</span>
                    </span>
                    <span className="shrink-0 font-label text-[9px] uppercase text-exp">+{pendingOf.get(mon.id) ?? 0} EXP pending</span>
                  </div>
                  <div className="mt-1 flex">
                    <ExpMeter level={mon.level} exp={mon.exp} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-ink-dim">EXP is applied when you bring them home.</p>
      </section>

      {t.recent.length > 0 && (
        <section className="ui-window m-2 p-3" aria-labelledby="recent-title">
          <h2 id="recent-title" className="mb-2 font-label text-[11px] uppercase text-info">
            Latest battles
          </h2>
          <ol className="flex flex-col gap-1 text-sm">
            {[...t.recent].reverse().map((b, i) => (
              <li key={i} className="flex items-center gap-2">
                <PixelSprite src={miniUrl(b.foe.dexId)} size={64} alt="" sheet className="-my-3" />
                <span className="min-w-0 flex-1 truncate">
                  {speciesName(b.foe.dexId)} <span className="font-label text-[9px] uppercase text-ink-dim">{formatLevel(b.foe)}</span>
                </span>
                <span className={`font-label text-[9px] uppercase ${b.won ? 'text-exp' : 'text-accent'}`}>{b.won ? 'Won' : 'Lost'}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="m-2 mt-3 flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}
        {confirming && !finished ? (
          <div className="ui-window flex flex-col gap-3 p-3" role="group" aria-label="Bring your trainer home?">
            <p className="text-sm">Bring your trainer home now? The battles so far count; training stops here.</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirming(false)} className="ui-button ui-focus min-h-11 font-label text-[10px] uppercase">
                Keep training
              </button>
              <button type="button" disabled={busy} onClick={() => void bringHome()} className="ui-button-primary ui-focus min-h-11 font-label text-[10px] uppercase">
                {busy ? 'Returning…' : 'Return now'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onLeave} className="ui-button ui-focus min-h-12 font-label text-[10px] uppercase">
              {finished ? 'Later' : 'Keep training'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => (finished ? void bringHome() : setConfirming(true))}
              className="ui-button-primary ui-focus min-h-12 font-label text-[10px] uppercase"
            >
              {busy ? 'Returning…' : 'Return & collect'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
