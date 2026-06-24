import { useMemo, useState } from 'react';
import type { Creature, Opponent, Side } from './game/types';
import { randomSeed } from './game/rng';
import {
  buildGauntlet,
  challengeOpponent,
  championSeed,
  TIER_LABEL,
} from './game/opponents';
import { teamFromMons, type LeaderboardEntry } from './game/leaderboard';
import {
  buildChampionTeam,
  buildOpponentTeam,
  buildSpecialTeam,
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
import { ChallengeResultScreen } from './components/ChallengeResultScreen';

type Phase =
  | 'title'
  | 'draft'
  | 'map'
  | 'battle'
  | 'recruit'
  | 'over'
  | 'challengeBattle'
  | 'challengeOver';

export default function App() {
  const [phase, setPhase] = useState<Phase>('title');
  const [seed, setSeed] = useState<string>(() => randomSeed());
  const [team, setTeam] = useState<Creature[]>([]);
  const [stage, setStage] = useState(0);
  const [won, setWon] = useState(false);
  const [defeated, setDefeated] = useState<Creature[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [bracket, setBracket] = useState<BracketId>(DEFAULT_BRACKET);

  // Just-for-fun exhibition match against another player's saved team.
  const [challenge, setChallenge] = useState<{
    foeTeam: Creature[];
    opponent: Opponent;
  } | null>(null);
  const [challengeSeed, setChallengeSeed] = useState<string>('');
  const [challengeWon, setChallengeWon] = useState(false);

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
      // Special cameo trainers field their fixed, canonical roster; the Champion
      // is the date-seeded daily boss; everyone else gets a type-themed squad.
      const foeTeam =
        opponent.tier === 'champion'
          ? buildChampionTeam(championSeed(new Date(), bracket), opponent.teamSize, dex)
          : opponent.tier === 'special' && opponent.specialId
            ? buildSpecialTeam(
                opponent.specialId,
                opponent.type,
                opponent.teamSize,
                battleSeed,
                dex,
              )
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
      });
      return { foeTeam, result };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, seed, stage, dex, bracket],
  );

  // Both teams get the same "hero" edge so a challenge is a fair mirror.
  const challengeBattle = useMemo<BattleResult | null>(() => {
    if (phase !== 'challengeBattle' || !challenge) return null;
    return simulateBattle(team, challenge.foeTeam, `challenge#${challengeSeed}`, {
      playerStatMult: PLAYER_STAT_MULT,
      foeStatMult: PLAYER_STAT_MULT,
    });
  }, [phase, challenge, challengeSeed, team]);

  const startChallenge = (entry: LeaderboardEntry) => {
    const foeTeam = teamFromMons(entry.team);
    if (foeTeam.length === 0) return;
    const cseed = randomSeed();
    setChallengeSeed(cseed);
    setChallenge({ foeTeam, opponent: challengeOpponent(entry.name, cseed) });
    setPhase('challengeBattle');
  };

  const startRun = (
    diff: Difficulty,
    chosenBracket: BracketId,
    customSeed?: string,
  ) => {
    setDifficulty(diff);
    setBracket(chosenBracket);
    setSeed(customSeed ?? randomSeed());
    setTeam([]);
    setStage(0);
    setWon(false);
    setPhase('draft');
  };

  const onBattleComplete = (winner: Side) => {
    if (winner === 'foe') {
      setWon(false);
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

  switch (phase) {
    case 'title':
      return <TitleScreen onStart={startRun} />;

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
          onFight={() => setPhase('battle')}
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
          currentTeam={team}
          defeatedTeam={defeated}
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
          bracket={bracket}
          clearedStages={won ? gauntlet.length : stage}
          onPlayAgain={() => setPhase('title')}
          onChallenge={startChallenge}
        />
      );

    case 'challengeBattle':
      if (!challengeBattle || !challenge) return null;
      return (
        <BattleScreen
          opponent={challenge.opponent}
          playerTeam={team}
          foeTeam={challenge.foeTeam}
          result={challengeBattle}
          onComplete={(winner) => {
            setChallengeWon(winner === 'player');
            setPhase('challengeOver');
          }}
        />
      );

    case 'challengeOver':
      if (!challenge) return null;
      return (
        <ChallengeResultScreen
          won={challengeWon}
          foeName={challenge.opponent.name}
          foeTeam={challenge.foeTeam}
          onRematch={() => {
            setChallengeSeed(randomSeed());
            setPhase('challengeBattle');
          }}
          onHome={() => setPhase('title')}
        />
      );
  }
}
