import { useMemo, useState } from 'react';
import type { Creature, Side } from './game/types';
import { randomSeed } from './game/rng';
import { buildGauntlet, championSeed, TIER_LABEL } from './game/opponents';
import {
  buildChampionTeam,
  buildOpponentTeam,
  simulateBattle,
  TIER_STAT_MULT,
  type BattleResult,
} from './game/battle';
import type { Difficulty } from './game/run';
import { TitleScreen } from './components/TitleScreen';
import { DraftScreen } from './components/DraftScreen';
import { MapScreen } from './components/MapScreen';
import { BattleScreen } from './components/BattleScreen';
import { RecruitScreen } from './components/RecruitScreen';
import { ResultScreen } from './components/ResultScreen';

type Phase = 'title' | 'draft' | 'map' | 'battle' | 'recruit' | 'over';

// "Hero" edge so a well-drafted (and well-recruited) team can realistically
// run the gauntlet — a strong team clears all 7 ~40% of the time. See
// scripts/sim-check.ts for the tuning sweep.
const PLAYER_STAT_MULT = 1.13;

export default function App() {
  const [phase, setPhase] = useState<Phase>('title');
  const [seed, setSeed] = useState<string>(() => randomSeed());
  const [team, setTeam] = useState<Creature[]>([]);
  const [stage, setStage] = useState(0);
  const [won, setWon] = useState(false);
  const [defeated, setDefeated] = useState<Creature[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  const gauntlet = useMemo(() => buildGauntlet(seed), [seed]);
  const opponent = gauntlet[stage];

  const battle = useMemo<{ foeTeam: Creature[]; result: BattleResult } | null>(
    () => {
      if (phase !== 'battle') return null;
      const battleSeed = `${seed}#${stage}`;
      // The Champion is the shared daily boss: its team is seeded by the date,
      // so it's identical for everyone, while the fight RNG stays run-specific.
      // The Champion has no type theme; Gyms and the Elite are type-themed.
      const foeTeam =
        opponent.tier === 'champion'
          ? buildChampionTeam(championSeed(), opponent.teamSize)
          : buildOpponentTeam(
              opponent.type,
              opponent.teamSize,
              opponent.tier,
              battleSeed,
            );
      const result = simulateBattle(team, foeTeam, battleSeed, {
        playerStatMult: PLAYER_STAT_MULT,
        foeStatMult: TIER_STAT_MULT[opponent.tier] ?? 1,
      });
      return { foeTeam, result };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, seed, stage],
  );

  const startRun = (diff: Difficulty, customSeed?: string) => {
    setDifficulty(diff);
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
      return (
        <ResultScreen
          gauntlet={gauntlet}
          won={won}
          team={team}
          seed={seed}
          clearedStages={won ? gauntlet.length : stage}
          onPlayAgain={() => setPhase('title')}
        />
      );
  }
}
