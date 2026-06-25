import { useEffect, useMemo, useState } from 'react';
import { dailyKey } from '../game/opponents';
import { TeamPortrait } from './TeamPortrait';
import {
  GEN_BRACKETS,
  bracketById,
  DEFAULT_BRACKET,
  type BracketId,
} from '../game/gens';
import { DIFFICULTY_INFO, type Difficulty } from '../game/run';
import {
  fetchLeaderboardHistory,
  type ChampionRecord,
  type HistoryDay,
} from '../game/leaderboard';
import { Leaderboard } from './Leaderboard';
import { CupIcon } from './CupIcon';
import { SupportLinks } from './SupportLinks';

// How far back the hall reaches. The live boards only live ~40 days, so older
// days show their archived champion but their full ladder is gone.
const HISTORY_DAYS = 30;
const ONE_DAY_MS = 86_400_000;

const DIFFICULTY_BADGE: Record<Difficulty, string> = {
  easy: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
  normal: 'border-sky-300/40 bg-sky-300/10 text-sky-200',
  hard: 'border-orange-300/40 bg-orange-300/10 text-orange-200',
  master: 'border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-200',
};

/** A frozen YYYY-MM-DD shifted by whole days, kept on the same UTC calendar. */
function shiftKey(key: string, deltaDays: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return dailyKey(d);
}

function longDate(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Yesterday" / "3 days ago" relative to today, for a friendlier header. */
function relativeDay(key: string): string {
  const today = dailyKey();
  const diff = Math.round(
    (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${key}T12:00:00Z`)) /
      ONE_DAY_MS,
  );
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff} days ago`;
}

/** One era's champion for a past day — tap to open that day's full ladder. */
function ChampionCard({
  rec,
  onOpen,
}: {
  rec: ChampionRecord;
  onOpen: () => void;
}) {
  const era = bracketById(rec.bracket);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`View the ${era.label} ladder for this day`}
      className="flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-amber-300/40 hover:bg-white/[0.06]"
    >
      <div className="flex w-full items-center gap-2.5">
        <CupIcon cup={era.cup} className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-white/40">
              {era.tab}
            </span>
            {rec.difficulty === 'master' && (
              <span title="Crowned on Master" className="text-amber-300">
                👑
              </span>
            )}
          </div>
          <span
            title={rec.name}
            className="block truncate text-sm font-bold text-white"
          >
            {rec.name}
          </span>
          {rec.defeated ? (
            <span className="block truncate text-[10px] font-semibold text-amber-300/80">
              ⚔ dethroned {rec.defeated}
            </span>
          ) : (
            rec.champion && (
              <span className="block truncate text-[10px] text-white/40">
                beat {rec.champion.name}
              </span>
            )
          )}
        </div>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DIFFICULTY_BADGE[rec.difficulty]}`}
        >
          {DIFFICULTY_INFO[rec.difficulty].label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {rec.team.slice(0, 6).map((mon, i) => (
          <TeamPortrait key={i} mon={mon} className="h-6 w-6" />
        ))}
      </div>
    </button>
  );
}

function DaySection({
  day,
  onOpen,
}: {
  day: HistoryDay;
  onOpen: (date: string, bracket: BracketId) => void;
}) {
  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-black text-white">{longDate(day.date)}</h3>
        <span className="text-[11px] text-white/40">{relativeDay(day.date)}</span>
      </div>
      {day.champions.length === 0 ? (
        <button
          type="button"
          onClick={() => onOpen(day.date, DEFAULT_BRACKET)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-center text-xs text-white/35 transition hover:bg-white/[0.05]"
        >
          No champions recorded — view the ladder
        </button>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {day.champions.map((rec) => (
            <ChampionCard
              key={rec.bracket}
              rec={rec}
              onOpen={() => onOpen(day.date, rec.bracket)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const [days, setDays] = useState<HistoryDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'hall' | 'browse'>('hall');
  // null = every era; otherwise narrow the hall to a single bracket's winners.
  const [eraFilter, setEraFilter] = useState<BracketId | null>(null);

  // The day being inspected in "browse" mode, plus which era's board to open.
  const [browseDate, setBrowseDate] = useState(() => shiftKey(dailyKey(), -1));
  const [browseBracket, setBrowseBracket] = useState<BracketId>(DEFAULT_BRACKET);

  useEffect(() => {
    let alive = true;
    fetchLeaderboardHistory(HISTORY_DAYS)
      .then((h) => {
        if (alive) setDays(h?.days ?? []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Narrow each day to the chosen era (dropping days with no winner there), or
  // show every era when no filter is active.
  const shownDays = useMemo<HistoryDay[]>(() => {
    if (!days) return [];
    if (!eraFilter) return days;
    return days
      .map((d) => ({
        date: d.date,
        champions: d.champions.filter((c) => c.bracket === eraFilter),
      }))
      .filter((d) => d.champions.length > 0);
  }, [days, eraFilter]);

  const oldest = useMemo(() => shiftKey(dailyKey(), -HISTORY_DAYS), []);
  const newest = useMemo(() => shiftKey(dailyKey(), -1), []);
  const canOlder = browseDate > oldest;
  const canNewer = browseDate < newest;

  const openDay = (date: string, bracket: BracketId) => {
    setBrowseDate(date);
    setBrowseBracket(bracket);
    setMode('browse');
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center px-4 py-8 text-center sm:px-6">
      <img
        src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
        alt="Poké Ball"
        className="mb-3 h-14 w-14 animate-floaty object-contain [image-rendering:pixelated] drop-shadow-[0_4px_16px_rgba(255,80,80,0.35)]"
      />
      <h2 className="text-3xl font-black text-amber-300 sm:text-4xl">
        Hall of Champions
      </h2>
      <p className="mt-2 max-w-md text-balance text-white/60">
        Every era’s daily winners, immortalised. Browse past days to see who
        topped each board — and replay any day’s ladder.
      </p>

      {/* View toggle: the archive roll-call vs. a single day's full ladder. */}
      <div className="mt-6 inline-flex rounded-full border border-white/15 bg-white/[0.03] p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setMode('hall')}
          aria-pressed={mode === 'hall'}
          className={`rounded-full px-4 py-1.5 transition ${
            mode === 'hall' ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'
          }`}
        >
          Champions
        </button>
        <button
          type="button"
          onClick={() => setMode('browse')}
          aria-pressed={mode === 'browse'}
          className={`rounded-full px-4 py-1.5 transition ${
            mode === 'browse' ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'
          }`}
        >
          Browse a day
        </button>
      </div>

      {mode === 'hall' ? (
        <div className="mt-6 w-full max-w-lg text-left">
          {/* Era filter — narrow the roll-call to a single bracket. */}
          <div className="flex flex-wrap justify-center gap-1.5">
            <button
              type="button"
              onClick={() => setEraFilter(null)}
              aria-pressed={eraFilter === null}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                eraFilter === null
                  ? 'border-white/70 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
              }`}
            >
              All eras
            </button>
            {GEN_BRACKETS.map((b) => {
              const active = b.id === eraFilter;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setEraFilter(b.id)}
                  aria-pressed={active}
                  title={b.label}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? 'border-white/70 bg-white/10 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
                  }`}
                >
                  <CupIcon
                    cup={b.cup}
                    className={`h-4 w-4 ${active ? '' : 'opacity-60 grayscale'}`}
                  />
                  {b.tab}
                </button>
              );
            })}
          </div>

          <div className="mt-6 space-y-6">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-white/40">
                Loading the hall…
              </p>
            ) : shownDays.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-white/40">
                {eraFilter
                  ? `No ${bracketById(eraFilter).label} champions recorded yet.`
                  : 'No champions yet — be the first to top a board today!'}
              </p>
            ) : (
              shownDays.map((day) => (
                <DaySection key={day.date} day={day} onOpen={openDay} />
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 w-full max-w-lg">
          {/* Day stepper — walk backward/forward through past ladders. */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <button
              type="button"
              onClick={() => canOlder && setBrowseDate((d) => shiftKey(d, -1))}
              disabled={!canOlder}
              aria-label="Previous day"
              className="rounded-full border border-white/15 px-3 py-1.5 text-sm font-bold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ←
            </button>
            <div className="min-w-0 text-center">
              <div className="truncate text-sm font-bold text-white">
                {longDate(browseDate)}
              </div>
              <div className="text-[11px] text-white/40">
                {relativeDay(browseDate)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => canNewer && setBrowseDate((d) => shiftKey(d, 1))}
              disabled={!canNewer}
              aria-label="Next day"
              className="rounded-full border border-white/15 px-3 py-1.5 text-sm font-bold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              →
            </button>
          </div>

          {/* The frozen board for the chosen day. Era tabs live inside; submit
              is disabled since there's no live run behind this view. */}
          <Leaderboard
            key={browseDate}
            date={browseDate}
            runBracket={browseBracket}
            canSubmit={false}
            run={{
              difficulty: 'normal',
              seed: '',
              stage: 0,
              clearedStages: 0,
              team: [],
            }}
            freshOnMount
          />
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-8 rounded-full border border-white/20 px-6 py-3 font-bold transition hover:bg-white/10"
      >
        ← Back
      </button>

      <div className="mt-8">
        <p className="mb-2 text-xs text-white/40">
          Enjoying Rental Rumble? Help keep it running:
        </p>
        <SupportLinks />
      </div>
    </div>
  );
}
