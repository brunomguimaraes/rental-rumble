import { useEffect, useMemo, useState } from 'react';
import { fetchMyRuns, type MyRun } from '../game/account';
import { teamFromMons } from '../game/leaderboard';
import { bracketById } from '../game/gens';
import { DIFFICULTY_INFO } from '../game/run';
import { MiniSprite } from './MiniSprite';

// The signed-in player's personal run archive, with All / Wins (hall of fame) /
// Losses (hall of shame) tabs. Purely a private view — the public boards are
// untouched.

type Tab = 'all' | 'win' | 'loss';

const OUTCOME_BADGE: Record<string, string> = {
  win: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
  loss: 'border-rose-300/40 bg-rose-300/10 text-rose-200',
  ragequit: 'border-amber-300/40 bg-amber-300/10 text-amber-200',
};

const OUTCOME_LABEL: Record<string, string> = {
  win: 'Win',
  loss: 'Loss',
  ragequit: 'Forfeit',
};

function timeAgo(at: number): string {
  const diff = Date.now() - at;
  const d = Math.floor(diff / 86_400_000);
  if (d >= 1) return `${d}d ago`;
  const h = Math.floor(diff / 3_600_000);
  if (h >= 1) return `${h}h ago`;
  const m = Math.floor(diff / 60_000);
  if (m >= 1) return `${m}m ago`;
  return 'just now';
}

function RunRow({ run }: { run: MyRun }) {
  const team = useMemo(() => teamFromMons(run.team), [run.team]);
  const era = bracketById(run.bracket);
  const diff = DIFFICULTY_INFO[run.difficulty]?.label ?? run.difficulty;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
            OUTCOME_BADGE[run.outcome] ?? OUTCOME_BADGE.loss
          }`}
        >
          {OUTCOME_LABEL[run.outcome] ?? 'Loss'}
        </span>
        <div className="text-xs text-white/55">
          {diff} · {era?.label ?? run.bracket}
        </div>
      </div>

      <div className="flex flex-1 flex-wrap gap-1">
        {team.map((c, i) => (
          <div
            key={`${c.id}-${i}`}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"
          >
            <MiniSprite creature={c} className="h-7 w-7" />
          </div>
        ))}
      </div>

      <div className="shrink-0 text-left text-[11px] text-white/45 sm:text-right">
        <div>
          {run.outcome === 'win'
            ? 'Cleared the ladder'
            : `Reached stage ${run.clearedStages}`}
          {run.fellTo ? ` · fell to ${run.fellTo}` : ''}
        </div>
        <div>
          {run.formsGained > 0 ? (
            <span className="text-emerald-300/80">+{run.formsGained} dex · </span>
          ) : null}
          {timeAgo(run.at)}
        </div>
      </div>
    </div>
  );
}

export function MyRunsScreen({ onBack }: { onBack: () => void }) {
  const [runs, setRuns] = useState<MyRun[] | null>(null);
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    let alive = true;
    fetchMyRuns().then((r) => {
      if (alive) setRuns(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!runs) return [];
    if (tab === 'win') return runs.filter((r) => r.outcome === 'win');
    if (tab === 'loss')
      return runs.filter((r) => r.outcome === 'loss' || r.outcome === 'ragequit');
    return runs;
  }, [runs, tab]);

  const wins = runs?.filter((r) => r.outcome === 'win').length ?? 0;
  const total = runs?.length ?? 0;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: `All (${total})` },
    { id: 'win', label: `Wins (${wins})` },
    { id: 'loss', label: `Losses (${total - wins})` },
  ];

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-8 sm:px-6">
      <header className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-1.5 text-sm font-semibold text-white/75 transition hover:bg-white/10"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-lg font-black leading-tight">My Runs</h1>
          <p className="text-[11px] text-white/40">
            Your personal history — wins are your hall of fame, losses your hall
            of shame.
          </p>
        </div>
      </header>

      <div className="mb-3 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? 'border-white/60 bg-white/15 text-white'
                : 'border-white/10 text-white/55 hover:bg-white/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {runs === null ? (
        <div className="mt-12 text-center text-sm text-white/40">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 text-center text-sm text-white/40">
          {total === 0
            ? 'No runs yet — play a run while signed in and it’ll show up here.'
            : 'Nothing in this tab yet.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((run) => (
            <RunRow key={run.runId} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
