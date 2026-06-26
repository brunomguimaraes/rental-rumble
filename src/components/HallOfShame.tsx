import { useEffect, useRef, useState } from 'react';
import type { Creature } from '../game/types';
import { TeamPortrait } from './TeamPortrait';
import { DailyCountdown } from './DailyCountdown';
import { dailyKey } from '../game/opponents';
import { bracketById, type BracketId } from '../game/gens';
import { DIFFICULTY_INFO, type Difficulty } from '../game/run';
import {
  buildShameSubmission,
  fetchHallOfShame,
  resolveShameName,
  submitLoss,
  type ShameEntry,
  type ShameResponse,
} from '../game/hallOfShame';

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// The "podium" of disgrace: the three most pathetic runs get a louder rose, the
// rest a quiet white — all in the chunky 8-bit font for arcade-scoreboard flavour.
const SHAME_RANK_COLOR = ['text-rose-300', 'text-rose-200/80', 'text-orange-300/80'];

function RankNum({ rank }: { rank: number }) {
  return (
    <span
      className={`w-9 shrink-0 text-center text-[11px] leading-none ${
        SHAME_RANK_COLOR[rank - 1] ?? 'text-white/45'
      }`}
      style={{ fontFamily: "'Press Start 2P', 'Courier New', monospace" }}
    >
      {rank}
    </span>
  );
}

const DIFFICULTY_BADGE: Record<Difficulty, string> = {
  easy: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
  normal: 'border-sky-300/40 bg-sky-300/10 text-sky-200',
  hard: 'border-orange-300/40 bg-orange-300/10 text-orange-200',
  master: 'border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-200',
};

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span
      title={`${DIFFICULTY_INFO[difficulty].label} mode`}
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DIFFICULTY_BADGE[difficulty]}`}
    >
      {DIFFICULTY_INFO[difficulty].label}
    </span>
  );
}

/** The badge of dishonour for those who didn't fall — they fled. */
function RagequitBadge() {
  return (
    <span
      title="Forfeited the run rather than fighting it out"
      className="shrink-0 rounded-full border border-red-400/50 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300"
    >
      🏳 Ragequit
    </span>
  );
}

/**
 * The Hall of Shame — the leaderboard's mischievous twin.
 *
 * Two modes, driven by whether a `run` is passed:
 *  - **Enshrine** (Run Over screen): given the lost run, the defeat is recorded
 *    automatically on mount (the only optional part is the name: leave it blank
 *    and a goofy gag alias is minted for you), with an optional rename. A
 *    localStorage marker keyed to the run makes the auto-submit idempotent, so
 *    reloads and React's double-mount never spawn a duplicate flop.
 *  - **Read-only** (title-screen view): no `run`, so nothing is written — it
 *    just shows today's wall of flops.
 */
export function HallOfShame({
  date,
  seed,
  run,
  onRenamed,
}: {
  date: string;
  /** The run seed — seeds the deterministic gag name so a reload shows the same. */
  seed?: string;
  /** The lost run to enshrine. Omit for a read-only view of the board. */
  run?: {
    bracket: BracketId;
    difficulty: Difficulty;
    clearedStages: number;
    /** The player's roster at the moment of defeat. */
    team: Creature[];
    /** The trainer who ended the run. Empty for a forfeit (nobody beat them). */
    fellTo: string;
    /** That trainer's roster, drawn as tiny "who beat you" portraits. */
    fellToTeam?: Creature[];
    /** The run was forfeited mid-gauntlet, not lost in battle — tag it a ragequit. */
    ragequit?: boolean;
  };
  /** Called after a successful rename — used to return to the title screen. */
  onRenamed?: () => void;
}) {
  const isToday = date === dailyKey();
  const [board, setBoard] = useState<ShameResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // The row this defeat landed on, so we can spotlight it and rename it.
  const [myEid, setMyEid] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{
    rank: number | null;
    total?: number;
  } | null>(null);
  // Whether the name was auto-minted (the player left it blank) — drives the
  // "not you? rename" nudge.
  const [wasGag, setWasGag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The optional rename field, pre-filled with any saved board name.
  const [nameInput, setNameInput] = useState(
    () => (localStorage.getItem('lb-name') ?? '').trim(),
  );
  const [renaming, setRenaming] = useState(false);

  // Enshrine exactly once, even under React StrictMode's double-mount.
  const didRunRef = useRef(false);

  const refresh = (fresh = false) => {
    setLoading(true);
    fetchHallOfShame(date, { fresh })
      .then(setBoard)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    // Read-only view (no run to enshrine): just show today's board.
    if (!run || !seed) {
      refresh(true);
      return;
    }

    const doneKey = `hos-done-${date}-${seed}-${run.clearedStages}`;
    const prior = localStorage.getItem(doneKey);
    if (prior) {
      // Already recorded this run on an earlier mount/reload — just show it.
      setMyEid(prior);
      refresh(true);
      return;
    }

    const saved = (localStorage.getItem('lb-name') ?? '').trim();
    const name = resolveShameName(saved, `${seed}:${run.clearedStages}`);
    setWasGag(!saved);

    void (async () => {
      const result = await submitLoss(
        buildShameSubmission({
          name,
          date,
          bracket: run.bracket,
          difficulty: run.difficulty,
          clearedStages: run.clearedStages,
          team: run.team,
          fellTo: run.fellTo,
          fellToTeam: run.fellToTeam,
          ragequit: run.ragequit,
        }),
      );
      if (result.ok && result.eid) {
        localStorage.setItem(doneKey, result.eid);
        setMyEid(result.eid);
        setPlacement({ rank: result.rank ?? null, total: result.total });
      } else {
        setError(result.error ?? 'Could not reach the Hall of Shame.');
      }
      // Either way, show the board (read-only if the write failed).
      refresh(result.ok);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the auto-assigned gag alias for a real name (updates the row in place,
  // so it never spawns a duplicate). Persisted for the next run.
  const rename = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !myEid || !run || renaming) return;
    localStorage.setItem('lb-name', trimmed);
    setRenaming(true);
    const result = await submitLoss(
      buildShameSubmission({
        name: trimmed,
        date,
        bracket: run.bracket,
        difficulty: run.difficulty,
        clearedStages: run.clearedStages,
        team: run.team,
        fellTo: run.fellTo,
        fellToTeam: run.fellToTeam,
        ragequit: run.ragequit,
        eid: myEid,
      }),
    );
    if (result.ok) {
      // Name saved — bow out to the title screen rather than lingering on the
      // board (the rename is the last thing anyone does on the Run Over screen).
      if (onRenamed) {
        onRenamed();
        return;
      }
      setRenaming(false);
      setWasGag(false);
      refresh(true);
    } else {
      setRenaming(false);
      setError(result.error ?? 'Could not rename your entry.');
    }
  };

  const myEntry = board?.entries.find((e) => e.id === myEid) ?? null;
  const myName = myEntry?.name ?? null;
  // Prefer the just-submitted placement, but fall back to the board row (so a
  // reload that skips the submit still shows "#N of M").
  const myRank = placement?.rank ?? myEntry?.rank ?? null;
  const myTotal = placement?.total ?? board?.total;

  return (
    <div className="mt-8 w-full max-w-2xl text-left">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-black text-white">
          💀 {isToday ? 'Today’s Hall of Shame' : 'Hall of Shame'}
        </h3>
        <span className="text-xs text-white/45">biggest flops first</span>
      </div>

      {isToday && (
        <div className="mt-2">
          <DailyCountdown label="Shame resets in" />
        </div>
      )}

      {/* You've been enshrined — name + optional rename. */}
      {myEid && (
        <div className="mt-3 rounded-2xl border border-rose-300/30 bg-rose-300/[0.06] p-3">
          <p className="text-sm font-semibold text-rose-200">
            You’ve been enshrined in the Hall of Shame
            {myName ? (
              <>
                {' '}as <span className="font-black text-white">{myName}</span>
              </>
            ) : (
              '…'
            )}
            {myRank ? (
              <span className="text-rose-200/70">
                {' '}· #{myRank}
                {myTotal ? ` of ${myTotal}` : ''} today
              </span>
            ) : null}
          </p>
          {wasGag && (
            <p className="mt-1 text-[11px] text-white/45">
              We picked that name for you. Not feeling it? Claim your real one:
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void rename();
              }}
              maxLength={24}
              placeholder="Your name (optional)"
              className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-rose-300/60"
            />
            <button
              type="button"
              onClick={() => void rename()}
              disabled={renaming || !nameInput.trim()}
              className="shrink-0 rounded-full bg-rose-300 px-4 py-2 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
            >
              {renaming ? 'Saving…' : 'Rename'}
            </button>
          </div>
        </div>
      )}

      {error && !myEid && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
          {error}
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {loading ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">
            Loading the wall of flops…
          </p>
        ) : !board || board.entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">
            No flops recorded yet. Lucky day.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {board.entries.map((e) => (
              <ShameRow key={e.id ?? `${e.rank}-${e.name}`} entry={e} mine={e.id === myEid} />
            ))}
          </ul>
        )}
      </div>
      {board && board.total > board.entries.length && (
        <p className="mt-2 text-center text-[11px] text-white/35">
          and {board.total - board.entries.length} more
          {isToday ? ' today' : ''}
        </p>
      )}
      <p className="mt-2 text-[11px] text-white/35">
        Every defeat is logged here — ranked by how few you cleared. Wear it with
        pride.{run ? ` (${bracketById(run.bracket).tag})` : ''}
      </p>
    </div>
  );
}

function ShameRow({ entry, mine }: { entry: ShameEntry; mine: boolean }) {
  return (
    <li
      className={`px-3 py-2.5 ${
        mine ? 'bg-rose-300/[0.08] ring-1 ring-inset ring-rose-300/30' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <RankNum rank={entry.rank} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span
              title={entry.name}
              className="min-w-0 truncate text-sm font-semibold text-white"
            >
              {entry.name}
              {mine && <span className="ml-1 text-[10px] text-rose-300/80">(you)</span>}
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-white/40">
              {timeLabel(entry.at)}
            </span>
          </div>
          {entry.ragequit ? (
            <span className="mt-0.5 block truncate text-[10px] font-semibold text-red-300/70">
              🏳 rage quit the run
            </span>
          ) : (
            entry.fellTo && (
              <span
                title={`Fell to ${entry.fellTo}`}
                className="mt-0.5 block truncate text-[10px] font-semibold text-rose-300/70"
              >
                ☠ fell to {entry.fellTo}
              </span>
            )
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {entry.ragequit && <RagequitBadge />}
            <DifficultyBadge difficulty={entry.difficulty} />
            <span
              title="Stages cleared before the wipe"
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white/60"
            >
              {entry.clearedStages} cleared
            </span>
            <div className="flex items-center gap-1">
              {entry.team.slice(0, 6).map((mon, i) => (
                <TeamPortrait key={i} mon={mon} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
