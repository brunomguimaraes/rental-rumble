import { useEffect, useMemo, useState } from 'react';
import {
  fetchLeaderboardSummary,
  type BracketLeader,
  type ChampionRecord,
  type LeaderboardEntry,
  type LeaderboardSummary,
} from '../game/leaderboard';
import { buildChampion, dailyKey } from '../game/opponents';
import { bracketById, bracketCup, type BracketId, type CupId } from '../game/gens';
import { DIFFICULTY_INFO, type Difficulty } from '../game/run';
import { CupIcon } from './CupIcon';
import { TeamPortrait } from './TeamPortrait';
import { TrainerSprite } from './TrainerSprite';

/** How long each era's champion stays on screen before the showcase rotates. */
const CYCLE_MS = 4200;

// Same colour language as the post-run board, so a Master clear reads as the
// standout it is even in this compact teaser.
const DIFFICULTY_PILL: Record<Difficulty, string> = {
  easy: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
  normal: 'border-sky-300/40 bg-sky-300/10 text-sky-200',
  hard: 'border-orange-300/40 bg-orange-300/10 text-orange-200',
  master: 'border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-200',
};

// Each era's card glows in its Ribbon Cup's contest-condition colour, so flipping
// through brackets reads as five distinct trophies rather than one type-tinted card.
const CUP_ACCENT: Record<CupId, string> = {
  cool: '#ef4444', // red
  beauty: '#3b82f6', // blue
  cute: '#ec4899', // pink
  clever: '#22c55e', // green
  tough: '#f5c542', // gold
};

/** The chunky arcade scoreboard font, shared with the ladder's rank numbers. */
const PIXEL_FONT = "'Press Start 2P', 'Courier New', monospace";

/**
 * A live, auto-rotating teaser of "today's champions" for the title screen.
 *
 * It pulls every era's top finisher in one request and cross-fades through them
 * (each fronted by the daily boss they toppled). When no board has been cleared
 * yet, it falls back to hyping the main full-dex boss — so the card always feels
 * alive, even at reset. Clicking it opens the full ladder.
 */
export function ChampionSpotlight({
  onViewLadder,
  summary: summaryProp,
}: {
  onViewLadder: () => void;
  /**
   * Pre-fetched summary supplied by the parent. When provided, the spotlight
   * reuses it instead of firing its own request, so the title screen can share
   * one fetch across the spotlight and the per-mode rank card. Omit it to keep
   * the component self-fetching (its original standalone behaviour).
   */
  summary?: LeaderboardSummary | null;
}) {
  const [fetched, setFetched] = useState<LeaderboardSummary | null>(null);
  const summary = summaryProp !== undefined ? summaryProp : fetched;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (summaryProp !== undefined) return; // parent owns the data
    let alive = true;
    fetchLeaderboardSummary(dailyKey()).then((s) => {
      if (alive) setFetched(s);
    });
    return () => {
      alive = false;
    };
  }, [summaryProp]);

  const slides = useMemo<BracketLeader[]>(() => {
    if (!summary) return [];
    const withLeader = summary.brackets.filter((b) => b.leader);
    if (withLeader.length > 0) return withLeader;
    // Nobody's cleared anything yet — hype the main full-dex boss instead of
    // showing five identical "be the first" cards.
    const all = summary.brackets.find((b) => b.bracket === 'all');
    return all ? [all] : summary.brackets.slice(0, 1);
  }, [summary]);

  // Keep the active index valid if the slide set changes (e.g. first clear).
  useEffect(() => {
    setIdx(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % slides.length),
      CYCLE_MS,
    );
    return () => clearInterval(t);
  }, [slides.length]);

  if (slides.length === 0) return null;

  const slide = slides[idx % slides.length];
  const meta = bracketById(slide.bracket);
  // Deterministic, so we can rebuild the boss (sprite + name + type) client-side
  // for the avatar without shipping art info over the wire.
  const champ = buildChampion(new Date(), slide.bracket);
  // Colour the whole card by the era's trophy, not the boss's type, so each
  // bracket's win reads as its own distinct prize.
  const accent = CUP_ACCENT[bracketCup(slide.bracket)] ?? '#f5c542';
  const { leader } = slide;

  return (
    <button
      type="button"
      onClick={onViewLadder}
      aria-label="View today’s ladder"
      className="group relative mt-6 w-full max-w-md overflow-hidden rounded-2xl border p-3 text-left transition hover:brightness-110"
      style={{ borderColor: `${accent}55`, background: `${accent}12` }}
    >
      <div key={idx} className="animate-spotlight-in flex items-center gap-3">
        <div className="relative h-16 w-16 shrink-0">
          <div
            className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl"
            style={{ background: `${accent}1f` }}
          >
            <TrainerSprite
              opponent={champ}
              animated
              className="h-14 w-14 animate-floaty"
            />
          </div>
          {/* Sits outside the clipped sprite box so it pops like a sticker. */}
          <CupIcon
            bracket={slide.bracket}
            className="absolute -bottom-2.5 -right-2.5 h-8 w-8 drop-shadow-[0_2px_5px_rgba(0,0,0,0.6)]"
          />
        </div>

        <div className="min-w-0 flex-1">
          {leader ? (
            <>
              <div
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
                style={{ color: accent }}
              >
                <span
                  className="text-[11px] leading-none text-amber-300"
                  style={{ fontFamily: PIXEL_FONT }}
                >
                  {leader.rank}
                </span>
                <span>Today’s Champion · {meta.tab}</span>
              </div>
              <div className="truncate text-lg font-black leading-tight text-white">
                {leader.name}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DIFFICULTY_PILL[leader.difficulty]}`}
                >
                  {DIFFICULTY_INFO[leader.difficulty].label}
                </span>
                <span className="truncate text-xs text-white/55">
                  toppled {champ.name}
                </span>
              </div>
              {leader.team.length > 0 && (
                <div className="mt-1.5 flex gap-0.5">
                  {leader.team.slice(0, 6).map((m, i) => (
                    <TeamPortrait key={i} mon={m} className="h-6 w-6" />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: accent }}
              >
                Today’s Boss · {meta.tab}
              </div>
              <div className="truncate text-lg font-black leading-tight text-white">
                {champ.name}
              </div>
              <div className="mt-1 text-xs text-white/55">
                No one’s toppled them yet — be the first to take the crown!
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {slides.length > 1 &&
            slides.map((s, i) => (
              <span
                key={s.bracket}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? 'w-4 bg-white/70' : 'w-1.5 bg-white/25'
                }`}
              />
            ))}
        </div>
        <span className="text-[10px] font-semibold text-white/45 transition group-hover:text-white/80">
          View ladder →
        </span>
      </div>
    </button>
  );
}

/**
 * The selected era's current #1 finisher, pinned beneath the day's boss so a
 * player eyeing a specific mode immediately sees the name, mode and team to
 * beat — without waiting for the spotlight to rotate around to it. Renders
 * nothing until someone has actually cleared that bracket today.
 */
export function BracketRankCard({
  bracket,
  leader,
  onViewLadder,
}: {
  bracket: BracketId;
  leader: LeaderboardEntry | null;
  onViewLadder: () => void;
}) {
  if (!leader) return null;
  const accent = CUP_ACCENT[bracketCup(bracket)] ?? '#f5c542';

  return (
    <button
      type="button"
      onClick={onViewLadder}
      aria-label="View today’s ladder"
      className="group mt-2 flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition hover:brightness-110"
      style={{ borderColor: `${accent}55`, background: `${accent}12` }}
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{ background: `${accent}1f` }}
      >
        <span
          className="text-sm leading-none text-amber-300"
          style={{ fontFamily: PIXEL_FONT }}
        >
          1
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: accent }}
        >
          Today’s #1
        </div>
        <div className="truncate font-black leading-tight text-white">
          {leader.name}
        </div>
        {leader.team.length > 0 && (
          <div className="mt-1 flex gap-0.5">
            {leader.team.slice(0, 6).map((m, i) => (
              <TeamPortrait key={i} mon={m} className="h-6 w-6" />
            ))}
          </div>
        )}
      </div>

      <span
        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DIFFICULTY_PILL[leader.difficulty]}`}
      >
        {DIFFICULTY_INFO[leader.difficulty].label}
      </span>
    </button>
  );
}

/**
 * Yesterday's winner for the selected era — a small nod to the previous day's
 * board pinned beneath today's #1, so the daily rhythm is visible at a glance.
 * Tapping it opens the Hall of Champions. Renders nothing until yesterday's
 * champion for this era is known.
 */
export function YesterdayChampionCard({
  record,
  onViewHistory,
}: {
  record: ChampionRecord | null;
  onViewHistory: () => void;
}) {
  if (!record) return null;
  const accent = CUP_ACCENT[bracketCup(record.bracket)] ?? '#f5c542';

  return (
    <button
      type="button"
      onClick={onViewHistory}
      aria-label="Open the Hall of Champions"
      className="group mt-2 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-2.5 text-left transition hover:bg-white/[0.05]"
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{ background: `${accent}1f` }}
      >
        <span className="text-lg leading-none">🏆</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
          Yesterday’s Champion · {bracketById(record.bracket).tab}
        </div>
        <div className="truncate font-black leading-tight text-white">
          {record.name}
        </div>
        {record.team.length > 0 && (
          <div className="mt-1 flex gap-0.5">
            {record.team.slice(0, 6).map((m, i) => (
              <TeamPortrait key={i} mon={m} className="h-6 w-6" />
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DIFFICULTY_PILL[record.difficulty]}`}
        >
          {DIFFICULTY_INFO[record.difficulty].label}
        </span>
        <span className="text-[10px] font-semibold text-white/40 transition group-hover:text-white/80">
          Hall →
        </span>
      </div>
    </button>
  );
}
