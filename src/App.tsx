import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import type { Creature, Opponent, RelicId, Side } from './game/types';
import { randomSeed } from './game/rng';
import { itemEventStages } from './game/relics';
import {
  buildGauntlet,
  challengeOpponent,
  championSeed,
  dailyKey,
  TIER_LABEL,
} from './game/opponents';
import {
  requestRunToken,
  teamFromMons,
  monToRecord,
  challengeKing,
  throneBattleSeed,
  type LeaderboardEntry,
  type ThroneGrant,
  type ChallengeKingResult,
} from './game/leaderboard';
import {
  buildChampionTeam,
  buildOpponentTeam,
  buildFamousTeam,
  simulateBattle,
  TIER_STAT_MULT,
  championFoeStatMult,
  PLAYER_STAT_MULT,
  type BattleResult,
} from './game/battle';
import type { Difficulty } from './game/run';
import { fetchMe, type AccountUser } from './game/account';
import {
  recordRun,
  unionTeamForms,
  type RunOutcome,
} from './game/progression';
import { pikachuRecruitReward } from './game/specials';
import { bracketDex, DEFAULT_BRACKET, type BracketId } from './game/gens';
import { TitleScreen } from './components/TitleScreen';
import { DraftScreen } from './components/DraftScreen';
import { MapScreen } from './components/MapScreen';
import { BattleScreen } from './components/BattleScreen';
import { ItemEventScreen } from './components/ItemEventScreen';
import { RecruitScreen } from './components/RecruitScreen';
import { ResultScreen } from './components/ResultScreen';
import { ThroneResultScreen } from './components/ThroneResultScreen';
import { LadderScreen } from './components/LadderScreen';
import { ShameScreen } from './components/ShameScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { hashIsGuide } from './guide/hash';
import { DevPanel } from './components/DevPanel';

// The guide bundles the whole MDX runtime + every doc page; lazy-load it so it
// stays out of the initial download and only arrives when a player opens it.
const GuideScreen = lazy(() =>
  import('./components/Guide').then((m) => ({ default: m.GuideScreen })),
);

// The Pokédex browses the full creature list (with portraits); lazy-load it so
// it stays out of the title screen's initial download.
const PokedexScreen = lazy(() =>
  import('./components/PokedexScreen').then((m) => ({ default: m.PokedexScreen })),
);

// The account hub (sign in / progress) is opt-in and rarely the first thing a
// player opens, so it's lazy-loaded too.
const AccountScreen = lazy(() =>
  import('./components/AccountScreen').then((m) => ({ default: m.AccountScreen })),
);

const MyRunsScreen = lazy(() =>
  import('./components/MyRunsScreen').then((m) => ({ default: m.MyRunsScreen })),
);

const TrainerSpritesScreen = import.meta.env.DEV
  ? lazy(() =>
      import('./components/TrainerSpritesScreen').then((m) => ({
        default: m.TrainerSpritesScreen,
      })),
    )
  : null;

/** Quiet placeholder shown while a lazy screen's chunk is fetched. */
function ScreenFallback() {
  return (
    <div className="grid min-h-[100dvh] place-items-center">
      <img
        src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
        alt="Loading"
        className="h-12 w-12 animate-spin object-contain [image-rendering:pixelated] opacity-70"
      />
    </div>
  );
}

type Phase =
  | 'title'
  | 'ladder'
  | 'shame'
  | 'history'
  | 'guide'
  | 'dex'
  | 'account'
  | 'myRuns'
  | 'trainerSprites'
  | 'draft'
  | 'map'
  | 'battle'
  | 'item'
  | 'recruit'
  | 'over'
  | 'throneBattle'
  | 'throneOver';

export default function App() {
  const [phase, setPhase] = useState<Phase>(() =>
    typeof window !== 'undefined' && hashIsGuide() ? 'guide' : 'title',
  );

  // Honour a cold-load deep link (e.g. a shared `#guide/zodiac` URL) by opening
  // the guide page straight away.
  useEffect(() => {
    if (phase === 'title' && hashIsGuide()) setPhase('guide');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate the optional account on load, and honour an email-link landing:
  // `?reset=` opens the Account screen on the new-password step; `?verified=`
  // shows a one-off note. Both params are then stripped so a refresh or share
  // doesn't replay them.
  useEffect(() => {
    fetchMe().then(setMe);
    const params = new URLSearchParams(window.location.search);
    const reset = params.get('reset');
    const verified = params.get('verified');
    const oauth = params.get('oauth');
    if (reset) {
      setAccountResetToken(reset);
      setPhase('account');
    }
    if (verified) {
      setVerifiedNote(
        verified === '1'
          ? 'Email verified — thanks!'
          : 'That verification link was invalid or expired.',
      );
    }
    if (oauth) {
      const notes: Record<string, string> = {
        ok: 'Signed in — welcome!',
        error: 'Sign-in failed. Please try again.',
        email_taken:
          'That email already has an account — sign in with your password first.',
        unconfigured: 'That sign-in option isn’t set up yet.',
      };
      if (notes[oauth]) setVerifiedNote(notes[oauth]);
    }
    if (reset || verified || oauth) {
      params.delete('reset');
      params.delete('verified');
      params.delete('oauth');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [seed, setSeed] = useState<string>(() => randomSeed());
  // Signed proof the server authorised this run's seed. Required to rank on the
  // leaderboard; null on offline/custom-seed runs (still fully playable).
  const [runToken, setRunToken] = useState<string | null>(null);
  const [team, setTeam] = useState<Creature[]>([]);
  // Team-wide passive "relics" collected from item events this run (see
  // relics.ts). Applied to every battle and carried into the verified
  // leaderboard/Throne payloads so a relic run stays reproducible & rankable.
  const [relics, setRelics] = useState<RelicId[]>([]);
  const [stage, setStage] = useState(0);
  const [won, setWon] = useState(false);
  // Set when the player forfeits from the map instead of losing a battle — the
  // run is still enshrined in the Hall of Shame, but tagged as a ragequit.
  const [ragequit, setRagequit] = useState(false);
  const [defeated, setDefeated] = useState<Creature[]>([]);
  // The roster of the trainer who ended the run — kept so the result/share card
  // can show who you fell to (the battle's foe team is otherwise discarded).
  const [lostToTeam, setLostToTeam] = useState<Creature[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [bracket, setBracket] = useState<BracketId>(DEFAULT_BRACKET);

  // The optional account (opt-in). `null` = signed out / anonymous, which is the
  // default and keeps the whole game playable without ever signing in.
  const [me, setMe] = useState<AccountUser | null>(null);
  // A password-reset token lifted from an email link's `?reset=` param, handed
  // to the Account screen so it opens straight into "set a new password".
  const [accountResetToken, setAccountResetToken] = useState<string | null>(null);
  // A one-off note shown after returning from the email-verification link.
  const [verifiedNote, setVerifiedNote] = useState<string | null>(null);
  // Every (dexId, variant) the team has worn this run — the Pokédex journal that
  // gets flushed to the account when the run ends.
  const [ownedForms, setOwnedForms] = useState<Set<string>>(() => new Set());
  // The runId we've already flushed, so the end-of-run effect fires exactly once.
  const flushedRef = useRef<string | null>(null);

  // The king-of-the-hill endgame: a Master champion's one shot at the reigning
  // Master #1. Unlike an exhibition, a win here is server-verified and takes the
  // top slot on the board.
  const [throne, setThrone] = useState<{
    foeTeam: Creature[];
    opponent: Opponent;
  } | null>(null);
  const [throneKing, setThroneKing] = useState<LeaderboardEntry | null>(null);
  const [throneSeed, setThroneSeed] = useState<string>('');
  const [throneToken, setThroneToken] = useState<string | null>(null);
  // The challenger's board row id for this title shot, echoed to the server so
  // it promotes the exact row (names can repeat on the arcade-style board).
  const [throneEid, setThroneEid] = useState<string>('');
  const [throneWon, setThroneWon] = useState(false);
  const [throneSubmitting, setThroneSubmitting] = useState(false);
  const [throneResult, setThroneResult] = useState<ChallengeKingResult | null>(
    null,
  );

  const gauntlet = useMemo(
    () => buildGauntlet(seed, difficulty, undefined, bracket),
    [seed, difficulty, bracket],
  );
  const opponent = gauntlet[stage];

  // Accumulate every (dexId, variant) the team has worn this run. Because draft,
  // recruit and evolution all flow through `team`, unioning on each change
  // captures intermediate evolution forms automatically (Squirtle → Wartortle →
  // Blastoise). `unionTeamForms` returns the same Set when nothing's new, so this
  // never loops.
  useEffect(() => {
    setOwnedForms((prev) => unionTeamForms(prev, team));
  }, [team]);

  // When a run ends, flush its owned forms + summary to the account (exactly
  // once). A no-op for anonymous players and for runs with no server token; the
  // server verifies the token and re-derives what was legitimately reachable
  // before crediting anything.
  useEffect(() => {
    if (phase !== 'over' || !me || !runToken) return;
    const runId = `${dailyKey()}:${seed}`;
    if (flushedRef.current === runId) return;
    flushedRef.current = runId;
    const outcome: RunOutcome = won ? 'win' : ragequit ? 'ragequit' : 'loss';
    recordRun({
      seed,
      token: runToken,
      date: dailyKey(),
      bracket,
      difficulty,
      outcome,
      clearedStages: won ? gauntlet.length : stage,
      stage,
      team: team.map(monToRecord),
      relics,
      fellTo: won ? undefined : opponent?.name,
      forms: [...ownedForms],
    }).then((r) => {
      // Reflect the new run/dex in the title pill + account screen.
      if (r.ok) fetchMe().then(setMe);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // The stage indices an item event appears *before* this run (interstitial —
  // never part of the gauntlet array, so the ladder length & Champion index are
  // untouched). Pinned to the seed so the run stays reproducible.
  const itemEvents = useMemo(
    () => itemEventStages(seed, difficulty, gauntlet.length, team),
    [seed, difficulty, gauntlet.length],
  );

  // The species pool for this run, restricted to the selected generation
  // bracket. Drives the draft and every foe — including the Champion — so a
  // gen-locked run keeps the whole ladder in-era. The `all` bracket is the full
  // dex, so its Champion stays the shared daily boss.
  const dex = useMemo(() => bracketDex(bracket), [bracket]);

  const battle = useMemo<{ foeTeam: Creature[]; result: BattleResult } | null>(
    () => {
      if (phase !== 'battle') return null;
      const battleSeed = `${seed}#${stage}`;
      // The Champion's team is seeded by the date (shared daily boss on a
      // standard run), while the fight RNG stays run-specific. On a gen-locked
      // run the filtered `dex` keeps the Champion in-gen too. The Champion has
      // no type theme; Gyms and the Elite are type-themed.
      // Famous trainers (Brock, Lorelei, Team Rocket…) field their fixed,
      // canonical roster; the Champion is the date-seeded daily boss; everyone
      // else gets a type-themed procedural squad.
      const foeTeam = opponent.famousId
        ? buildFamousTeam(
            opponent.famousId,
            opponent.type,
            opponent.teamSize,
            battleSeed,
            dex,
            opponent.tier,
          )
        : opponent.tier === 'champion'
          ? buildChampionTeam(championSeed(new Date(), bracket), opponent.teamSize, dex)
          : buildOpponentTeam(
              opponent.type,
              opponent.teamSize,
              opponent.tier,
              battleSeed,
              dex,
            );
      const result = simulateBattle(team, foeTeam, battleSeed, {
        playerStatMult: PLAYER_STAT_MULT,
        // The daily boss carries a hidden, difficulty-scaled stat passive on top
        // of its Champion tier edge; every other rung uses the bare tier mult.
        foeStatMult:
          opponent.tier === 'champion'
            ? championFoeStatMult(difficulty)
            : TIER_STAT_MULT[opponent.tier] ?? 1,
        difficulty,
        playerRelics: relics,
        foeTier: opponent.tier,
      });
      return { foeTeam, result };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, seed, stage, dex, bracket, difficulty, relics],
  );

  // A throne fight is a fair mirror, replayed from the server-issued seed so the
  // browser and the server agree on the outcome before the board changes hands.
  const throneBattle = useMemo<BattleResult | null>(() => {
    if (phase !== 'throneBattle' || !throne) return null;
    return simulateBattle(team, throne.foeTeam, throneBattleSeed(throneSeed), {
      playerStatMult: PLAYER_STAT_MULT,
      foeStatMult: PLAYER_STAT_MULT,
      playerRelics: relics,
      foeRelics: throneKing?.relics ?? [],
    });
  }, [phase, throne, throneSeed, team, relics, throneKing]);

  const startThrone = (grant: ThroneGrant, king: LeaderboardEntry) => {
    const foeTeam = teamFromMons(king.team);
    if (foeTeam.length === 0) return;
    setThroneToken(grant.token);
    setThroneSeed(grant.seed);
    setThroneEid(grant.eid ?? '');
    setThroneKing(king);
    setThroneResult(null);
    setThroneWon(false);
    setThrone({ foeTeam, opponent: challengeOpponent(king.name, grant.seed) });
    setPhase('throneBattle');
  };

  const finishThrone = async (winner: Side) => {
    const won = winner === 'player';
    setThroneWon(won);
    setPhase('throneOver');
    if (!won || !throneKing) return;
    // Confirm the takeover with the server (it re-simulates the fight and the
    // one-shot token before promoting the challenger to the top of the board).
    setThroneSubmitting(true);
    const result = await challengeKing({
      token: throneToken,
      name: localStorage.getItem('lb-name') ?? '',
      eid: throneEid,
      // Pin the exact champion we just fought, so the server verifies against
      // their team — not whoever happens to be #1 by the time this lands.
      kingEid: throneKing.id,
      date: dailyKey(),
      bracket,
      seed: throneSeed,
    });
    setThroneResult(result);
    setThroneSubmitting(false);
  };

  const startRun = async (
    diff: Difficulty,
    chosenBracket: BracketId,
    customSeed?: string,
  ) => {
    setDifficulty(diff);
    setBracket(chosenBracket);
    setTeam([]);
    setRelics([]);
    setStage(0);
    setWon(false);
    setRagequit(false);
    setOwnedForms(new Set());
    flushedRef.current = null;

    // The server picks the seed and signs a token for it — that's what keeps the
    // leaderboard honest. A custom/shared seed (or an offline failure) is local
    // only: the run plays, but with no token it can't rank.
    let nextSeed = customSeed ?? randomSeed();
    let token: string | null = null;
    if (!customSeed) {
      const start = await requestRunToken({
        bracket: chosenBracket,
        difficulty: diff,
      });
      if (start) {
        nextSeed = start.seed;
        token = start.token;
      }
    }
    setSeed(nextSeed);
    setRunToken(token);
    setPhase('draft');
  };

  const onBattleComplete = (winner: Side) => {
    if (winner === 'foe') {
      setWon(false);
      setRagequit(false);
      setLostToTeam(battle?.foeTeam ?? []);
      setPhase('over');
      return;
    }
    if (stage + 1 >= gauntlet.length) {
      setWon(true);
      setPhase('over');
      return;
    }
    if (opponent.famousId === 'pikachu') {
      const reward = pikachuRecruitReward(`${seed}#${stage}`, dex);
      setDefeated(reward ? [reward] : (battle?.foeTeam ?? []));
    } else {
      setDefeated(battle?.foeTeam ?? []);
    }
    setPhase('recruit');
  };

  // Adopt a freshly signed-in/created account. Keeping the public board name in
  // sync (without linking board rows) means a logged-in player's submitted runs
  // show their account name.
  const handleAuthed = (user: AccountUser) => {
    setMe(user);
    if (user.displayName) localStorage.setItem('lb-name', user.displayName);
    setAccountResetToken(null);
  };

  const renderScreen = () => {
    switch (phase) {
    case 'title':
      return (
        <TitleScreen
          onStart={startRun}
          onViewLadder={() => setPhase('ladder')}
          onViewShame={() => setPhase('shame')}
          onViewHistory={() => setPhase('history')}
          onViewGuide={() => setPhase('guide')}
          onViewDex={() => setPhase('dex')}
          onViewAccount={() => setPhase('account')}
          me={me}
        />
      );

    case 'ladder':
      return <LadderScreen onBack={() => setPhase('title')} />;

    case 'shame':
      return <ShameScreen onBack={() => setPhase('title')} />;

    case 'dex':
      return <PokedexScreen onBack={() => setPhase('title')} me={me} />;

    case 'account':
      return (
        <AccountScreen
          // Re-key on auth state so the screen re-initialises to the right step
          // (profile when signed in, sign-in form when signed out / after reset).
          key={`${me?.id ?? 'anon'}:${accountResetToken ?? ''}`}
          me={me}
          resetToken={accountResetToken}
          onBack={() => setPhase('title')}
          onAuthed={handleAuthed}
          onSignedOut={() => setMe(null)}
          onViewMyRuns={me ? () => setPhase('myRuns') : undefined}
        />
      );

    case 'myRuns':
      return <MyRunsScreen onBack={() => setPhase('account')} />;

    case 'trainerSprites':
      if (!TrainerSpritesScreen) return null;
      return <TrainerSpritesScreen onBack={() => setPhase('title')} />;

    case 'history':
      return <HistoryScreen onBack={() => setPhase('title')} />;

    case 'guide':
      return <GuideScreen onBack={() => setPhase('title')} />;

    case 'draft':
      return (
        <DraftScreen
          seed={seed}
          difficulty={difficulty}
          dex={dex}
          onConfirm={(chosen) => {
            setTeam(chosen);
            setStage(0);
            setPhase('map');
          }}
        />
      );

    case 'map':
      return (
        <MapScreen
          gauntlet={gauntlet}
          team={team}
          relics={relics}
          stage={stage}
          seed={seed}
          difficulty={difficulty}
          onFight={() => setPhase('battle')}
          onSkip={() => {
            const next = stage + 1;
            setStage(next);
            setPhase(itemEvents.has(next) ? 'item' : 'map');
          }}
          onQuit={() => {
            // A forfeit isn't a quiet exit — the run is enshrined in the Hall
            // of Shame, tagged as a ragequit, ranked by how far they'd got.
            setWon(false);
            setRagequit(true);
            setLostToTeam([]);
            setPhase('over');
          }}
          onReorder={setTeam}
        />
      );

    case 'battle':
      if (!battle) return null;
      return (
        <BattleScreen
          opponent={opponent}
          playerTeam={team}
          foeTeam={battle.foeTeam}
          result={battle.result}
          onComplete={onBattleComplete}
        />
      );

    case 'recruit': {
      const next = gauntlet[stage + 1];
      return (
        <RecruitScreen
          opponentName={opponent.name}
          nextLabel={`On to ${TIER_LABEL[next.tier]} ${next.name}`}
          bracket={bracket}
          currentTeam={team}
          defeatedTeam={defeated}
          allowSignReroll={opponent.signRerollReward ?? false}
          rerollStrong={opponent.signRerollStrong ?? false}
          rerollSeed={`reroll:${seed}:${stage}`}
          abilityRerollSeed={`ability-reroll:${seed}:${stage}`}
          moveRollSeed={`move-roll:${seed}:${stage}`}
          onConfirm={(newTeam) => {
            setTeam(newTeam);
            const next = stage + 1;
            setStage(next);
            setPhase(itemEvents.has(next) ? 'item' : 'map');
          }}
        />
      );
    }

    case 'item':
      return (
        <ItemEventScreen
          seed={seed}
          stage={stage}
          team={team}
          owned={relics}
          nextLabel={`On to ${TIER_LABEL[opponent.tier]} ${opponent.name}`}
          onConfirm={(picked) => {
            if (picked) setRelics((r) => [...r, picked]);
            setPhase('map');
          }}
        />
      );

    case 'over':
      // Every bracket has its own daily Champion and leaderboard, so a finished
      // run always faces a verifiable boss for its era.
      return (
        <ResultScreen
          gauntlet={gauntlet}
          won={won}
          team={team}
          seed={seed}
          runToken={runToken}
          bracket={bracket}
          difficulty={difficulty}
          relics={relics}
          clearedStages={won ? gauntlet.length : stage}
          lostToTeam={lostToTeam}
          ragequit={ragequit}
          onPlayAgain={() => setPhase('title')}
          onChallengeThrone={startThrone}
        />
      );

    case 'throneBattle':
      if (!throneBattle || !throne) return null;
      return (
        <BattleScreen
          opponent={throne.opponent}
          playerTeam={team}
          foeTeam={throne.foeTeam}
          result={throneBattle}
          onComplete={finishThrone}
          lockSpeed
        />
      );

    case 'throneOver':
      if (!throne || !throneKing) return null;
      return (
        <ThroneResultScreen
          won={throneWon}
          kingName={throneKing.name}
          kingTeam={throne.foeTeam}
          submitting={throneSubmitting}
          result={throneResult}
          onHome={() => setPhase('title')}
        />
      );
    }
  };

  return (
    <>
      <Suspense fallback={<ScreenFallback />}>{renderScreen()}</Suspense>
      {verifiedNote && (
        <div className="fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[90vw]">
          <button
            type="button"
            onClick={() => setVerifiedNote(null)}
            className="rounded-full border border-white/15 bg-black/80 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur transition hover:bg-black/90"
          >
            {verifiedNote} <span className="ml-2 text-white/40">✕</span>
          </button>
        </div>
      )}
      {/* Statically gated so Vite tree-shakes the whole dev panel out of any
          production build — the cheats simply don't exist there. */}
      {import.meta.env.DEV && (
        <DevPanel onViewTrainerSprites={() => setPhase('trainerSprites')} />
      )}
      <Analytics />
    </>
  );
}
