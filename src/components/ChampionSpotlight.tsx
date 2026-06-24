import { useEffect, useMemo, useState } from 'react';
import {
  fetchLeaderboardSummary,
  type BracketLeader,
  type LeaderboardSummary,
} from '../game/leaderboard';
import { buildChampion, dailyKey } from '../game/opponents';
import { bracketById } from '../game/gens';
import { miniUrl } from '../game/pokemon';
import { TYPE_COLORS } from '../game/typechart';
import { DIFFICULTY_INFO, type Difficulty } from '../game/run';
import { CupIcon } from './CupIcon';
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

/** A single team miniature rendered straight from a National Dex id. */
function MiniIcon({ dexId }: { dexId: number }) {
  return (
    <div
      className="h-5 w-5 bg-no-repeat [image-rendering:pixelated]"
      style={{
        backgroundImage: `url(${miniUrl(dexId)})`,
        backgroundSize: '200% 100%',
        backgroundPosition: 'left center',
      }}
    />
  );
}

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
}: {
  onViewLadder: () => void;
}) {
  const [summary, setSummary] = useState<LeaderboardSummary | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchLeaderboardSummary(dailyKey()).then((s) => {
      if (alive) setSummary(s);
    });
    return () => {
      alive = false;
    };
  }, []);

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
  const accent = TYPE_COLORS[champ.type] ?? '#f5c542';
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
        <div
          className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl"
          style={{ background: `${accent}1f` }}
        >
          <TrainerSprite
            opponent={champ}
            animated
            className="h-14 w-14 animate-floaty"
          />
          <CupIcon
            bracket={slide.bracket}
            className="absolute -bottom-1 -right-1 h-6 w-6 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
          />
        </div>

        <div className="min-w-0 flex-1">
          {leader ? (
            <>
              <div
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: accent }}
              >
                🥇 Today’s Champion · {meta.tab}
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
                    <MiniIcon key={i} dexId={Number(m.id)} />
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
