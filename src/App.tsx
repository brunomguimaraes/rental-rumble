import { useMemo, useState } from 'react';
import type { Creature, Opponent, Side } from './game/types';
import { randomSeed } from './game/rng';
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
  PLAYER_STAT_MULT,
  type BattleResult,
} from './game/battle';
import type { Difficulty } from './game/run';
import { bracketDex, DEFAULT_BRACKET, type BracketId } from './game/gens';
import { TitleScreen } from './components/TitleScreen';
import { DraftScreen } from './components/DraftScreen';
import { MapScreen } from './components/MapScreen';
import { BattleScreen } from './components/BattleScreen';
import { RecruitScreen } from './components/RecruitScreen';
import { ResultScreen } from './components/ResultScreen';
import { ThroneResultScreen } from './components/ThroneResultScreen';
import { LadderScreen } from './components/LadderScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { DevPanel } from './components/DevPanel';

type Phase =
  | 'title'
  | 'ladder'
  | 'history'
  | 'draft'
  | 'map'
  | 'battle'
  | 'recruit'
  | 'over'
  | 'throneBattle'
  | 'throneOver';

export default function App() {
  const [phase, setPhase] = useState<Phase>('title');
  const [seed, setSeed] = useState<string>(() => randomSeed());
  // Signed proof the server authorised this run's seed. Required to rank on the
  // leaderboard; null on offline/custom-seed runs (still fully playable).
  const [runToken, setRunToken] = useState<string | null>(null);
  const [team, setTeam] = useState<Creature[]>([]);
  const [stage, setStage] = useState(0);
  const [won, setWon] = useState(false);
  const [defeated, setDefeated] = useState<Creature[]>([]);
  // The roster of the trainer who ended the run — kept so the result/share card
  // can show who you fell to (the battle's foe team is otherwise discarded).
  const [lostToTeam, setLostToTeam] = useState<Creature[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [bracket, setBracket] = useState<BracketId>(DEFAULT_BRACKET);

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
        foeStatMult: TIER_STAT_MULT[opponent.tier] ?? 1,
        difficulty,
      });
      return { foeTeam, result };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, seed, stage, dex, bracket, difficulty],
  );

  // A throne fight is a fair mirror, replayed from the server-issued seed so the
  // browser and the server agree on the outcome before the board changes hands.
  const throneBattle = useMemo<BattleResult | null>(() => {
    if (phase !== 'throneBattle' || !throne) return null;
    return simulateBattle(team, throne.foeTeam, throneBattleSeed(throneSeed), {
      playerStatMult: PLAYER_STAT_MULT,
      foeStatMult: PLAYER_STAT_MULT,
    });
  }, [phase, throne, throneSeed, team]);

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
    setStage(0);
    setWon(false);

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
      setLostToTeam(battle?.foeTeam ?? []);
      setPhase('over');
      return;
    }
    if (stage + 1 >= gauntlet.length) {
      setWon(true);
      setPhase('over');
      return;
    }
    setDefeated(battle?.foeTeam ?? []);
    setPhase('recruit');
  };

  const renderScreen = () => {
    switch (phase) {
    case 'title':
      return (
        <TitleScreen
          onStart={startRun}
          onViewLadder={() => setPhase('ladder')}
          onViewHistory={() => setPhase('history')}
        />
      );

    case 'ladder':
      return <LadderScreen onBack={() => setPhase('title')} />;

    case 'history':
      return <HistoryScreen onBack={() => setPhase('title')} />;

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
          stage={stage}
          seed={seed}
          difficulty={difficulty}
          onFight={() => setPhase('battle')}
          onSkip={() => {
            setStage((s) => s + 1);
            setPhase('map');
          }}
          onQuit={() => setPhase('title')}
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
          onConfirm={(newTeam) => {
            setTeam(newTeam);
            setStage((s) => s + 1);
            setPhase('map');
          }}
        />
      );
    }

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
          clearedStages={won ? gauntlet.length : stage}
          lostToTeam={lostToTeam}
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
      {renderScreen()}
      {/* Statically gated so Vite tree-shakes the whole dev panel out of any
          production build — the cheats simply don't exist there. */}
      {import.meta.env.DEV && <DevPanel />}
    </>
  );
}
