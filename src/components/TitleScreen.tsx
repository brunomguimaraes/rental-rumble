import { useEffect, useMemo, useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_INFO,
  gauntletLength,
  type Difficulty,
} from '../game/run';
import {
  fetchLeaderboardHistory,
  fetchLeaderboardSummary,
  type ChampionRecord,
  type LeaderboardSummary,
} from '../game/leaderboard';
import {
  GEN_BRACKETS,
  bracketDex,
  DEFAULT_BRACKET,
  type BracketId,
} from '../game/gens';
import { buildChampion, championSeed, dailyKey } from '../game/opponents';
import { buildChampionTeam } from '../game/battle';
import { TypeMarquee } from './TypeMarquee';
import { CupIcon } from './CupIcon';
import { MiniSprite } from './MiniSprite';
import { TrainerSprite } from './TrainerSprite';
import { Credits } from './Credits';
import { PrivacyPolicy } from './PrivacyPolicy';
import { SupportLinks } from './SupportLinks';
import { DiscordLink } from './DiscordLink';
import { DailyCountdown } from './DailyCountdown';
import {
  ChampionSpotlight,
  BracketRankCard,
  YesterdayChampionCard,
} from './ChampionSpotlight';

export function TitleScreen({
  onStart,
  onViewLadder,
  onViewHistory,
  onViewGuide,
  onViewDex,
}: {
  onStart: (
    difficulty: Difficulty,
    bracket: BracketId,
    seed?: string,
  ) => void | Promise<void>;
  /** Open the standalone "today's ladder" page. */
  onViewLadder: () => void;
  /** Open the past-days "hall of champions" page. */
  onViewHistory: () => void;
  /** Open the standalone "how battles work" guide page. */
  onViewGuide: () => void;
  /** Open the standalone Pokédex browser. */
  onViewDex: () => void;
}) {
  // Custom seed feature disabled: letting players paste a seed added UI/UX
  // complexity (extra input, validation, share copy) for little payoff. Runs
  // still use an internal random seed, so determinism/sharing logic is intact —
  // only the manual entry is gone. Left commented for easy re-enable later.
  //   const [seedInput, setSeedInput] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [bracket, setBracket] = useState<BracketId>(DEFAULT_BRACKET);
  const [showChampion, setShowChampion] = useState(false);
  // Starting a run asks the server for a signed seed first; keep the button
  // honest (and unclickable twice) while that round-trip is in flight.
  const [starting, setStarting] = useState(false);

  const begin = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await onStart(difficulty, bracket);
    } finally {
      setStarting(false);
    }
  };

  const isAll = bracket === 'all';

  // Today's standings for every era, fetched once and shared between the
  // rotating spotlight and the per-mode rank card below the boss.
  const [summary, setSummary] = useState<LeaderboardSummary | null>(null);
  useEffect(() => {
    let alive = true;
    fetchLeaderboardSummary(dailyKey()).then((s) => {
      if (alive) setSummary(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The current #1 for the selected era, if anyone has cleared it today.
  const bracketLeader = useMemo(
    () =>
      summary?.brackets.find((b) => b.bracket === bracket)?.leader ?? null,
    [summary, bracket],
  );

  // Yesterday's champions (one fetch), so the selected era can show who held
  // the crown the day before — a small nod to the daily cadence.
  const [yesterday, setYesterday] = useState<ChampionRecord[]>([]);
  useEffect(() => {
    let alive = true;
    fetchLeaderboardHistory(1).then((h) => {
      if (alive) setYesterday(h?.days[0]?.champions ?? []);
    });
    return () => {
      alive = false;
    };
  }, []);
  const yesterdayLeader = useMemo(
    () => yesterday.find((c) => c.bracket === bracket) ?? null,
    [yesterday, bracket],
  );

  // Today's Champion for the chosen era. Every bracket has its own daily boss
  // (name + team), shared by everyone all day; `all` is the original full-dex
  // boss. The team is locked to the bracket's dex so the whole ladder stays
  // in-era.
  const champion = useMemo(() => buildChampion(new Date(), bracket), [bracket]);
  const championTeam = useMemo(
    () =>
      buildChampionTeam(
        championSeed(new Date(), bracket),
        champion.teamSize,
        bracketDex(bracket),
      ),
    [champion, bracket],
  );

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center justify-center px-5 py-10 text-center sm:px-6">
      <img
        src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
        alt="Poké Ball"
        className="mb-3 h-16 w-16 animate-floaty object-contain [image-rendering:pixelated] drop-shadow-[0_4px_16px_rgba(255,80,80,0.35)] sm:h-20 sm:w-20"
      />
      <h1 className="bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-6xl">
        RENTAL RUMBLE
      </h1>
      <p className="mt-3 max-w-md text-balance text-white/60">
        Roll a pool of Pokémon, draft a team of six, and auto-battle your way
        from rookie to <span className="text-white">Champion</span> — recruiting
        the Pokémon you beat along the way.
      </p>

      <div className="mt-6 w-full">
        <TypeMarquee />
      </div>

      {/* Live "today's champions" teaser — the first players to topple each
          era's daily boss, auto-rotating. Falls back to boss hype when no board
          has been cleared yet. Tapping it opens the full ladder. */}
      <ChampionSpotlight onViewLadder={onViewLadder} summary={summary} />

      {/* Live countdown to the next daily boss/board reset. */}
      <div className="mt-4">
        <DailyCountdown />
      </div>

      {/* Generation bracket picker — locks the whole run (draft pool and every
          foe, Champion included) to an era's dex, with its own daily board. */}
      <div className="mt-8 w-full max-w-md">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Choose your era
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GEN_BRACKETS.map((b) => {
            const active = b.id === bracket;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBracket(b.id)}
                aria-pressed={active}
                className={`flex flex-col items-center rounded-2xl border px-2 py-2.5 text-center transition ${
                  active
                    ? 'border-white/70 bg-white/10'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <CupIcon
                  cup={b.cup}
                  className={`mb-1 h-7 w-7 transition ${
                    active ? '' : 'opacity-50 grayscale'
                  }`}
                />
                <div className="text-sm font-bold">{b.label}</div>
                <div className="text-[11px] text-white/50">{b.tag}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-white/45">
          {isAll ? (
            <>The complete National Dex — the standard mode.</>
          ) : (
            <>
              {bracketDex(bracket).length} Pokémon in play · ranked on its own
              board.
            </>
          )}
        </p>
      </div>

      {/* Today's Champion — the daily boss everyone is racing to topple (per era) */}
      <div className="mt-6 w-full max-w-md">
        <button
          type="button"
          onClick={() => setShowChampion((v) => !v)}
          aria-expanded={showChampion}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2.5 text-left transition hover:bg-amber-300/[0.1]"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-amber-300/15">
            <TrainerSprite opponent={champion} className="h-11 w-11" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
              Today’s Champion
            </div>
            <div className="truncate font-bold">
              {champion.name}{' '}
              <span className="font-normal text-white/45">
                · {isAll ? 'the daily boss' : GEN_BRACKETS.find((b) => b.id === bracket)?.label}
              </span>
            </div>
          </div>
          <CupIcon bracket={bracket} className="h-6 w-6" />
          <span className="shrink-0 text-white/40">
            {showChampion ? '▲' : '▼'}
          </span>
        </button>

        {showChampion && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-white/55">
              {champion.name} fields the same six all day ({dailyKey()})
              {isAll ? '' : ' for this era'}. Clear the ladder, then dethrone
              them to take the crown.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {championTeam.map((c, i) => (
                <div
                  key={`${c.id}-${i}`}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04]"
                >
                  <MiniSprite creature={c} className="h-9 w-9" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The selected era's current #1 — shown right under the boss so the
            score to beat is visible the moment you pick a mode. */}
        <BracketRankCard
          bracket={bracket}
          leader={bracketLeader}
          onViewLadder={onViewLadder}
        />

        {/* Who held this era's crown yesterday — opens the full hall. */}
        <YesterdayChampionCard
          record={yesterdayLeader}
          onViewHistory={onViewHistory}
        />
      </div>

      {/* Difficulty picker */}
      <div className="mt-8 w-full max-w-md">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Difficulty — sets the ladder length & draft skips
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIFFICULTIES.map((d) => {
            const active = d === difficulty;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`rounded-2xl border px-2 py-2.5 text-center transition ${
                  active
                    ? 'border-white/70 bg-white/10'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-sm font-bold">
                  {DIFFICULTY_INFO[d].label}
                </div>
                <div className="text-[11px] text-white/50">
                  {gauntletLength(d)} foes · {DIFFICULTY_INFO[d].skips} skips
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-white/45">
          {DIFFICULTY_INFO[difficulty].blurb}
        </p>
      </div>

      <button
        type="button"
        onClick={begin}
        disabled={starting}
        className="mt-8 rounded-full bg-white px-8 py-3 text-lg font-bold text-black transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {starting ? 'Starting…' : 'Start Adventure →'}
      </button>

      {/* Custom seed entry disabled: the manual seed box added complexity
          without enough player value. Internal random seeds still drive every
          run; only this manual-entry UI is hidden. Kept for easy re-enable.
      <div className="mt-6 flex w-full max-w-md flex-wrap items-center justify-center gap-2">
        <input
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value)}
          placeholder="custom seed (optional)"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 placeholder:text-white/30 focus:border-white/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() =>
            onStart(difficulty, GENERATIONS, seedInput.trim() || undefined)
          }
          disabled={!seedInput.trim()}
          className="shrink-0 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-30"
        >
          Use seed
        </button>
      </div>
      */}

      {/* Champions tier — the ladder & hall are the headline destinations
          after the game itself, so they get matched medium emphasis. */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onViewLadder}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
        >
          <CupIcon cup="cool" className="h-4 w-4" /> Today’s ladder
        </button>
        <button
          type="button"
          onClick={onViewHistory}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
        >
          <CupIcon cup="tough" className="h-4 w-4" /> Hall of Champions
        </button>
      </div>

      {/* Everything else — muted, lower-priority pills. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onViewDex}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white/55 transition hover:bg-white/[0.06] hover:text-white/80"
        >
          📕 Pokédex
        </button>
        <button
          type="button"
          onClick={onViewGuide}
          className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white/55 transition hover:bg-white/[0.06] hover:text-white/80"
        >
          ❔ How battles work
        </button>
        <DiscordLink pill />
      </div>

      {/* Seed-sharing blurb hidden alongside the disabled custom seed feature —
          it promised manual seed entry that no longer exists in the UI.
      <p className="mt-10 max-w-sm text-xs leading-relaxed text-white/35">
        Every run is defined by its seed — share it and a friend gets the exact
        same draft pool and gauntlet.
      </p>
      */}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Credits />
        <PrivacyPolicy />
        <SupportLinks />
      </div>

      <p className="mt-6 max-w-md text-[11px] leading-relaxed text-white/30">
        Made by a lifelong Pokémon fan, out of pure love for the games — never
        for profit. Rental Rumble is an unofficial, non-commercial fan project
        and is not affiliated with Nintendo. It does not own or claim any rights
        to any Nintendo trademark or the Pokémon trademark, and all references to
        such are used with admiration, for commentary and informational purposes
        only. 💛
      </p>
    </div>
  );
}
