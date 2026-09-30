import type { Creature } from './types.js';
import type { ActivityConfig } from './activity.js';
import { simulateBattle } from './battle.js';
import { RNG } from './rng.js';
import { rollPoolWild, type RolledWild, type WildView } from './wilds.js';

// Idle training's pure core. Battle k meets the slot-k wild and fights it with
// the frozen party; the first loss ends training. Deterministic from (party,
// seed, config, count), so the status the server shows mid-session and the
// settlement it pays out later agree battle for battle.

export interface TrainingBattle {
  slot: number;
  foe: WildView;
  won: boolean;
  turns: number;
}

export interface TrainingRun {
  battles: TrainingBattle[];
  wins: number;
  fell: boolean;
}

/** The wild met in training slot `slot`. */
export function trainingFoe(seed: string, cfg: ActivityConfig, slot: number): RolledWild {
  return rollPoolWild(cfg.wild, new RNG(`${seed}:t:${slot}`));
}

export function simulateTraining(party: Creature[], seed: string, cfg: ActivityConfig, count: number): TrainingRun {
  const battles: TrainingBattle[] = [];
  let wins = 0;
  if (party.length === 0) return { battles, wins, fell: false };
  for (let slot = 0; slot < count; slot++) {
    const foe = trainingFoe(seed, cfg, slot);
    const result = simulateBattle(party, [foe.creature], `${seed}#t#${slot}`, { foeStatMult: foe.statMult });
    const won = result.winner === 'player';
    battles.push({ slot, foe: foe.view, won, turns: result.turns });
    if (!won) return { battles, wins, fell: true };
    wins++;
  }
  return { battles, wins, fell: false };
}
