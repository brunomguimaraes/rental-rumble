import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AbilityId, Creature, Move, MoveCategory, Sign } from '../game/types';
import type { BracketId } from '../game/gens';
import {
  canEvolve,
  evolutionTargets,
  evolveCreature,
  withSign,
  withAbility,
  withMoveOverride,
  asShiny,
  canBeShiny,
  withRandomPortrait,
  sameFamily,
} from '../game/pokemon';
import {
  rollMoveOptions,
  moveCategory,
  moveCategoryLabel,
  moveEffectLabel,
  moveSelfNote,
} from '../game/moves';
import { TYPE_COLORS, typeIconUrl, typeLabel } from '../game/typechart';
import {
  rerollSign,
  rerollRareSign,
  forcedRareSign,
  signTier,
  signIconUrl,
  signLabel,
  signSummary,
  SIGN_INFO,
  ALL_SIGNS,
  type SignTier,
} from '../game/zodiac';
import {
  abilityDescription,
  abilityInfo,
  abilitiesForDex,
  hasAbilityChoice,
  rerollAbility,
} from '../game/abilities';
import { allRareEnabled, allShinyEnabled } from '../game/dev';
import { shinyChanceForTeam } from '../game/run';
import { RNG } from '../game/rng';
import { CreatureCard } from './CreatureCard';
import { CupIcon } from './CupIcon';

type Mode = 'choose' | 'recruit' | 'evolve' | 'move' | 'reroll' | 'ability';
type RewardMode = Exclude<Mode, 'choose'>;

// Picking a reward type is a commitment — once chosen the player can't switch to
// another reward — so a gate confirms it first. That gate gets old fast across a
// run, so the player can opt out of it; the preference sticks across battles and
// reloads via localStorage, mirroring how battle speed is remembered.
const COMMIT_SKIP_KEY = 'recruit-skip-commit-confirm';
const readSkipCommitConfirm = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(COMMIT_SKIP_KEY) === '1';
};
const writeSkipCommitConfirm = (skip: boolean) => {
  if (typeof window === 'undefined') return;
  if (skip) window.localStorage.setItem(COMMIT_SKIP_KEY, '1');
  else window.localStorage.removeItem(COMMIT_SKIP_KEY);
};

// Evolving reveals the new ability and can't be undone, so a separate gate makes
// the player commit *before* the ability is shown — otherwise they could preview
// each evolution's ability and back out, fishing for the best one. Like the
// commit gate above, the player can opt out of it, remembered across reloads.
const EVOLVE_SKIP_KEY = 'recruit-skip-evolve-confirm';
const readSkipEvolveConfirm = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(EVOLVE_SKIP_KEY) === '1';
};
const writeSkipEvolveConfirm = (skip: boolean) => {
  if (typeof window === 'undefined') return;
  if (skip) window.localStorage.setItem(EVOLVE_SKIP_KEY, '1');
  else window.localStorage.removeItem(EVOLVE_SKIP_KEY);
};

// Per-reward copy for the commit gate, so the confirmation names exactly what
// the player is locking themselves into before the back-out option disappears.
const REWARD_META: Record<RewardMode, { emoji: string; title: string; commit: string }> = {
  recruit: {
    emoji: '🔄',
    title: 'Recruit a Pokémon',
    commit: 'You\'ll take one of the defeated team into your own.',
  },
  evolve: {
    emoji: '🎟️',
    title: 'Evolution Ticket',
    commit: 'You\'ll evolve one of your team into its next stage.',
  },
  move: {
    emoji: '📝',
    title: 'Tweak a Move',
    commit: 'You\'ll swap one move on one of your team for another it can learn.',
  },
  reroll: {
    emoji: '🎲',
    title: 'Reroll a Sign',
    commit: 'You\'ll gamble one of your team\'s zodiac signs for a new one.',
  },
  ability: {
    emoji: '✦',
    title: 'Reroll an Ability',
    commit: 'You\'ll change one of your team\'s abilities from its pool.',
  },
};

export function RecruitScreen({
  opponentName,
  nextLabel,
  bracket,
  currentTeam,
  defeatedTeam,
  allowSignReroll = false,
  rerollStrong = false,
  rerollSeed,
  abilityRerollSeed,
  moveRollSeed,
  onConfirm,
}: {
  opponentName: string;
  nextLabel: string;
  bracket: BracketId;
  currentTeam: Creature[];
  defeatedTeam: Creature[];
  // Whether the rare "reroll a sign" reward is offered (set after the run's last
  // special trainer). `rerollSeed` pins the outcome deterministically so the
  // gamble can't be re-rolled by leaving and re-entering the screen. The same
  // gate also unlocks the sibling "reroll an ability" reward.
  allowSignReroll?: boolean;
  // Hidden reward tier (from the special trainer's `strong` flag). For signs a
  // "strong" special guarantees a rare; for abilities it lets the player *pick*
  // from the pool, while a "weak" special is the ordinary random gamble. Never
  // surfaced to the player — both look identical up front.
  rerollStrong?: boolean;
  rerollSeed?: string;
  // Seed pinning the random ability-reroll outcome (weak special). Same idea as
  // `rerollSeed`: fixed per run+stage so it can't be re-fished.
  abilityRerollSeed?: string;
  // Seed pinning the "Tweak a Move" reward's roll: the three replacement moves on
  // offer are drawn from this per run+stage, so the gamble can't be re-fished by
  // leaving and re-entering — only by choosing a different move to replace.
  moveRollSeed?: string;
  onConfirm: (team: Creature[]) => void;
}) {
  const [mode, setMode] = useState<Mode>('choose');

  // A reward type the player has tapped but not yet committed to. While set, the
  // commit gate is shown; choosing a reward only enters its mode once confirmed
  // (or immediately, if the player has opted out of the gate).
  const [pendingMode, setPendingMode] = useState<RewardMode | null>(null);
  const [skipCommitConfirm, setSkipCommitConfirm] = useState(readSkipCommitConfirm);

  // A claimed sign reroll plays a slot-machine reveal before we advance, so the
  // gamble lands with a beat of suspense instead of silently swapping the card.
  const [rolling, setRolling] = useState(false);

  // Reward 1 — recruit: take exactly one foe Pokémon into one of your slots.
  const [foeIdx, setFoeIdx] = useState<number | null>(null);
  const [recruitSlot, setRecruitSlot] = useState<number | null>(null);

  // Reward 2 — evolution ticket: evolve exactly one of YOUR Pokémon. The pick is
  // only "done" once committed — until then the slot/target are armed but the
  // evolved form (and its new ability) stays hidden so the player can't preview
  // it and back out. `pendingEvolve` is an armed-but-unconfirmed evolution that
  // the gate is asking about; committing locks the whole team (no switching).
  const [evolveSlot, setEvolveSlot] = useState<number | null>(null);
  const [evolveTarget, setEvolveTarget] = useState<number | null>(null);
  const [evolveCommitted, setEvolveCommitted] = useState(false);
  const [pendingEvolve, setPendingEvolve] = useState<{ slot: number; target: number } | null>(null);
  const [skipEvolveConfirm, setSkipEvolveConfirm] = useState(readSkipEvolveConfirm);
  // Committing an evolution plays a full-screen evolution reveal — the sibling of
  // the sign/ability slot-machine reveals — so the locked-in result lands with a
  // flourish (and a clear way out) instead of silently flipping the card.
  const [revealEvolve, setRevealEvolve] = useState(false);

  // Reward 2.5 — tweak a move: replace one move on one of YOUR Pokémon with
  // another from the species' legal pool (a deliberate, build-it-yourself pick —
  // no gamble). Three steps: which Pokémon, which move slot, the replacement.
  const [moveTeamSlot, setMoveTeamSlot] = useState<number | null>(null);
  const [moveSlotIdx, setMoveSlotIdx] = useState<number | null>(null);
  const [moveChoice, setMoveChoice] = useState<Move | null>(null);

  // Reward 3 — sign reroll: gamble one of YOUR Pokémon's signs. The outcome is
  // pinned to a run+stage seed, so the *rarity* of the result is fixed before the
  // player ever picks — they only choose which Pokémon receives it. That makes it
  // impossible to fish for a rare/mythic by leaving and re-entering the screen.
  const [rerollSlot, setRerollSlot] = useState<number | null>(null);

  // The sign this reward would grant a given slot. Deterministic (seed-pinned),
  // so re-selecting only swaps which Pokémon benefits — never the luck. The
  // outcome is kept hidden from the player until they confirm, so this is only
  // ever used to build the final team — never to preview the result on screen.
  // A "strong" special guarantees a rare sign; a "weak" one is the ordinary
  // random reroll. Both share the same signature, so the only difference the
  // player ever sees is what the reveal animation finally lands on.
  const rerolledSignFor = (i: number): Sign =>
    (rerollStrong ? rerollRareSign : rerollSign)(
      currentTeam[i].stats,
      new RNG(rerollSeed ?? 'reroll'),
      currentTeam[i].sign,
    );

  // Reward 4 — ability reroll: change one of YOUR Pokémon's abilities. After a
  // "strong" special the player *picks* from the species' pool (abilityChoice);
  // after a "weak" one it's a blind, seed-pinned gamble like the sign reroll.
  const [abilitySlot, setAbilitySlot] = useState<number | null>(null);
  const [abilityChoice, setAbilityChoice] = useState<AbilityId | null>(null);

  // The ability this reward would grant a given slot. For a strong special this
  // is the player's explicit pick; for a weak one it's the deterministic gamble.
  const abilityResultFor = (i: number): AbilityId | undefined => {
    if (rerollStrong) return abilityChoice ?? currentTeam[i].ability;
    return rerollAbility(
      currentTeam[i].dexId,
      new RNG(abilityRerollSeed ?? 'ability-reroll'),
      currentTeam[i].ability,
    );
  };

  // How a defeated foe presents as a recruit. Two independent blessings can land
  // here, mirroring the draft so a recruit can be rare/mythic AND shiny at once:
  //   • A celestial sign — a small natural shot, or every time under the dev
  //     "all rare/mythic" cheat.
  //   • A shiny coat (flat stat boost) — the same natural SHINY_CHANCE the draft
  //     uses, or forced by the dev "all shiny" cheat (where the species supports
  //     it). Opponents never fight shiny, so this is the foe's lustre revealing
  //     itself only once it joins your team.
  // Every roll is seeded by the creature so the previewed card and the Pokémon
  // you actually receive always match, and can't be re-fished by re-entering.
  const allRare = allRareEnabled();
  const allShiny = allShinyEnabled();
  const recruitView = (c: Creature): Creature => {
    let view = c;
    if (allRare) {
      const sign = forcedRareSign(view.stats, new RNG(`devrare:${view.dexId}:${view.sign}`));
      view = withSign(view, sign);
    }
    const shinyRng = new RNG(`recruitshiny:${c.dexId}:${c.sign}`);
    const shinyRoll = shinyRng.chance(shinyChanceForTeam(currentTeam));
    if (!view.shiny && (allShiny || shinyRoll) && canBeShiny(view.dexId)) {
      view = withRandomPortrait(asShiny(view), shinyRng);
    }
    return view;
  };
  const defeatedView = defeatedTeam.map(recruitView);

  // A team can't hold an ancestor and its descendant (same line). Recruiting swaps
  // a foe into one slot, so a slot is only a legal target if no *other* slot
  // already species-locks against the foe — letting you swap a foe onto its own
  // line (e.g. trade your Ivysaur for their Venusaur) while still blocking a
  // duplicate, but allowing branch siblings (e.g. Vaporeon + Jolteon). A foe
  // with no legal slot at all can't be recruited.
  const recruitSlotAllowed = (foe: Creature, slot: number) =>
    currentTeam.every((c, j) => j === slot || !sameFamily(c.dexId, foe.dexId));
  const canRecruitFoe = (foe: Creature) =>
    currentTeam.some((_, slot) => recruitSlotAllowed(foe, slot));

  const anyEvolvable = currentTeam.some((c) => canEvolve(c, bracket));

  const recruitDone = foeIdx !== null && recruitSlot !== null;
  // An evolution only counts once the player has passed the confirm gate — until
  // then the result (and its ability) is never revealed on the cards.
  const evolveDone = evolveCommitted && evolveSlot !== null && evolveTarget !== null;
  const moveDone = moveTeamSlot !== null && moveSlotIdx !== null && moveChoice !== null;
  const rerollDone = rerollSlot !== null;
  // A strong special needs an explicit pick; a weak one is locked in by the slot
  // alone (the result is a blind gamble revealed on confirm).
  const abilityDone =
    abilitySlot !== null && (!rerollStrong || abilityChoice !== null);

  // The team we'd hand back if the player confirms right now.
  const resultTeam = currentTeam.map((c, i) => {
    if (mode === 'recruit' && recruitDone && i === recruitSlot) return defeatedView[foeIdx];
    if (mode === 'evolve' && evolveDone && i === evolveSlot) return evolveCreature(c, evolveTarget);
    if (mode === 'move' && moveDone && i === moveTeamSlot)
      return withMoveOverride(c, moveSlotIdx, moveChoice);
    if (mode === 'reroll' && rerollDone && i === rerollSlot) return withSign(c, rerolledSignFor(i));
    if (mode === 'ability' && abilityDone && i === abilitySlot)
      return withAbility(c, abilityResultFor(i));
    return c;
  });

  // The locked roll of replacement moves for the current (Pokémon, move-slot)
  // pick — seed-pinned, so re-entering can't re-fish it, and deterministic, so
  // selecting one option never reshuffles the rest. A fresh set comes only from
  // choosing a different move to replace (each slot rolls its own three).
  const moveRollOptions =
    mode === 'move' && moveTeamSlot !== null && moveSlotIdx !== null
      ? rollMoveOptions(
          currentTeam[moveTeamSlot].types,
          currentTeam[moveTeamSlot].dexId,
          currentTeam[moveTeamSlot].moves.map((m) => m.name),
          `${moveRollSeed ?? 'move-roll'}:${moveTeamSlot}:${moveSlotIdx}:${currentTeam[moveTeamSlot].dexId}`,
        )
      : [];

  // Entering a reward is a one-way door (no "change reward" once inside), so a
  // gate confirms the pick first — unless the player has chosen to skip it.
  const chooseReward = (m: RewardMode) => {
    if (skipCommitConfirm) setMode(m);
    else setPendingMode(m);
  };

  const commitReward = (dontAskAgain: boolean) => {
    if (pendingMode === null) return;
    if (dontAskAgain) {
      setSkipCommitConfirm(true);
      writeSkipCommitConfirm(true);
    }
    setMode(pendingMode);
    setPendingMode(null);
  };

  // Lock in an evolution: reveal the result and freeze the team (no switching to a
  // different target, no skipping). This is the point of no return.
  const commitEvolution = (slot: number, target: number) => {
    setEvolveSlot(slot);
    setEvolveTarget(target);
    setEvolveCommitted(true);
    setPendingEvolve(null);
    // The reveal mounts in the same commit as the inline card flip, so it covers
    // the board before the evolved form (and its new ability) can be glimpsed.
    setRevealEvolve(true);
  };

  // Arm an evolution. Unless the player has opted out, the confirm gate stands
  // between here and the commit — so the evolved ability is never previewed.
  const armEvolution = (slot: number, target: number) => {
    if (skipEvolveConfirm) commitEvolution(slot, target);
    else setPendingEvolve({ slot, target });
  };

  const pickTeamForEvolve = (i: number) => {
    if (evolveCommitted) return; // the team is frozen once an evolution is locked in
    const targets = evolutionTargets(currentTeam[i].dexId, bracket);
    if (targets.length === 0) return;
    // A single-stage line has only one outcome, so tapping it arms the gate
    // straight away; a branched line first lets the player choose which branch.
    if (targets.length === 1) {
      armEvolution(i, targets[0]);
    } else {
      setEvolveSlot(i);
      setEvolveTarget(null);
    }
  };

  const confirmEvolve = (dontAskAgain: boolean) => {
    if (pendingEvolve === null) return;
    if (dontAskAgain) {
      setSkipEvolveConfirm(true);
      writeSkipEvolveConfirm(true);
    }
    commitEvolution(pendingEvolve.slot, pendingEvolve.target);
  };

  // A reward is only "claimed" once it's fully chosen. Until then — in any mode,
  // including after you've stepped into recruit/evolve — the player can still
  // skip outright and move on with their current team.
  const rewardChosen = recruitDone || evolveDone || moveDone || rerollDone || abilityDone;
  const continueLabel = rewardChosen ? nextLabel : 'Skip reward';

  // Pick (or move) which team member gets the move tweak, resetting the slot &
  // replacement choice so each new target starts from a clean pick.
  const pickTeamForMove = (i: number) => {
    const next = moveTeamSlot === i ? null : i;
    setMoveTeamSlot(next);
    setMoveSlotIdx(null);
    setMoveChoice(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 pb-28 sm:px-4 sm:py-8 sm:pb-28">
      <div className="text-center">
        <CupIcon bracket={bracket} className="mx-auto h-12 w-12" />
        <h2 className="mt-2 text-2xl font-black text-emerald-300 sm:text-3xl">
          {opponentName} defeated!
        </h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-white/55">
          {mode === 'choose'
            ? 'Claim one reward for the win — choose carefully, you only get one.'
            : mode === 'recruit'
              ? 'Pick one of their Pokémon, then tap a slot on your team to swap it in.'
              : mode === 'evolve'
                ? 'Spend your Evolution Ticket on one of your team — pick a Pokémon to evolve.'
                : mode === 'move'
                  ? 'Pick a Pokémon, the move to drop, then the new move it learns instead.'
                  : mode === 'reroll'
                    ? 'Pick one of your team to reroll its sign — fate decides the rest.'
                    : rerollStrong
                      ? 'Pick a Pokémon, then choose its new ability from its pool.'
                      : 'Pick one of your team to reroll its ability — fate decides the rest.'}
        </p>
      </div>

      {/* Step 1 — choose your reward */}
      {mode === 'choose' && (
        <div
          className={`mt-8 grid gap-4 sm:grid-cols-2 ${allowSignReroll ? 'md:grid-cols-3 xl:grid-cols-5' : 'md:grid-cols-3'}`}
        >
          <RewardOption
            emoji="🔄"
            title="Recruit a Pokémon"
            desc={`Swap one of ${opponentName}'s Pokémon into your team — keeps its sign & ball.`}
            preview={<RecruitPreview creatures={defeatedView} />}
            onClick={() => chooseReward('recruit')}
          />
          <RewardOption
            emoji="🎟️"
            title="Evolution Ticket"
            desc={
              anyEvolvable
                ? 'Evolve one Pokémon already on your team into its next stage.'
                : 'No Pokémon on your team can evolve right now.'
            }
            preview={
              anyEvolvable ? (
                <PreviewRow creatures={currentTeam.filter((c) => canEvolve(c, bracket))} />
              ) : undefined
            }
            disabled={!anyEvolvable}
            onClick={() => anyEvolvable && chooseReward('evolve')}
          />
          <RewardOption
            emoji="📝"
            title="Tweak a Move"
            desc="Swap one move on any of your team for another it can learn — fine-tune your build."
            preview={<PreviewRow creatures={currentTeam} />}
            onClick={() => chooseReward('move')}
          />
          {allowSignReroll && (
            <RewardOption
              emoji="🎲"
              title="Reroll a Sign"
              desc="Gamble one of your team's zodiac signs for a brand-new one. Who knows what the stars hold?"
              preview={<PreviewRow creatures={currentTeam} />}
              onClick={() => chooseReward('reroll')}
            />
          )}
          {allowSignReroll && (
            <RewardOption
              emoji="✦"
              title="Reroll an Ability"
              desc={
                rerollStrong
                  ? 'Hand-pick a new ability from a Pokémon\'s pool. Only mons with a choice of abilities qualify.'
                  : 'Gamble a Pokémon\'s ability for another from its pool. Only mons with a choice of abilities qualify.'
              }
              preview={
                <PreviewRow creatures={currentTeam.filter((c) => hasAbilityChoice(c.dexId))} />
              }
              onClick={() => chooseReward('ability')}
            />
          )}
        </div>
      )}

      {/* Step 2a — recruit */}
      {mode === 'recruit' && (
        <>
          <RewardHeader label="Recruiting from defeated team" />

          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
              Your team
              {foeIdx !== null && recruitSlot === null && (
                <span className="ml-2 text-emerald-300">
                  ← tap a slot to swap in {defeatedTeam[foeIdx].name}
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {resultTeam.map((c, i) => {
                const armed = foeIdx !== null;
                // While a foe is armed, only slots that wouldn't leave the team
                // with two members of the foe's evolutionary line are tappable.
                const allowed = armed && recruitSlotAllowed(defeatedView[foeIdx], i);
                const swapped = recruitDone && i === recruitSlot;
                // Highlight valid drop targets only while you're still choosing —
                // once a slot is picked it carries the card's own selected frame.
                const targetable = allowed && !recruitDone;
                return (
                  <div
                    key={`${c.id}-${i}`}
                    className={`relative rounded-2xl ${
                      targetable ? 'ring-2 ring-emerald-300/60 ring-offset-2 ring-offset-[#0c0c14]' : ''
                    }`}
                  >
                    <CreatureCard
                      creature={c}
                      selected={swapped}
                      disabled={armed && !allowed}
                      onClick={allowed ? () => setRecruitSlot(i) : undefined}
                    />
                    {swapped && <Tag color="emerald" text="RECRUITED" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-7">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
              {opponentName}'s Pokémon
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {defeatedView.map((c, i) => {
                // Every team slot already belongs to this foe's line, so taking it
                // would unavoidably duplicate that line — it can't be recruited.
                const recruitable = canRecruitFoe(c);
                return (
                  <div key={i} className="relative rounded-2xl">
                    <CreatureCard
                      creature={c}
                      selected={foeIdx === i}
                      disabled={!recruitable}
                      onClick={
                        recruitable
                          ? () => {
                              setFoeIdx(foeIdx === i ? null : i);
                              setRecruitSlot(null);
                            }
                          : undefined
                      }
                    />
                    {!recruitable && <Tag color="slate" text="ON TEAM" />}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Step 2b — evolve */}
      {mode === 'evolve' && (
        <>
          <RewardHeader label="Evolution Ticket" />

          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
              Your team
              <span className="ml-2 text-white/35">tap an evolvable Pokémon</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {currentTeam.map((c, i) => {
                const evolvable = canEvolve(c, bracket);
                const isPicked = evolveSlot === i;
                // Only show the evolved form once committed; before that the card
                // keeps its current shape so the new ability stays a surprise.
                const isEvolved = evolveDone && isPicked;
                const shown = isEvolved ? evolveCreature(c, evolveTarget) : c;
                return (
                  <div key={`${c.id}-${i}`} className="relative rounded-2xl">
                    <CreatureCard
                      creature={shown}
                      selected={isPicked}
                      disabled={!evolvable || (evolveCommitted && !isPicked)}
                      onClick={!evolveCommitted && evolvable ? () => pickTeamForEvolve(i) : undefined}
                    />
                    {isEvolved && <Tag color="amber" text="EVOLVED" />}
                    {!evolvable && <Tag color="slate" text="MAX" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Branched lines: choose which evolution to take. The species, types and
              stats are shown (you need them to pick a branch) but the resulting
              ability stays hidden until you commit — so you can't fish for it. */}
          {evolveSlot !== null &&
            !evolveCommitted &&
            evolutionTargets(currentTeam[evolveSlot].dexId, bracket).length > 1 && (
              <div className="mt-7">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
                  Choose an evolution for {currentTeam[evolveSlot].name}
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {evolutionTargets(currentTeam[evolveSlot].dexId, bracket).map((dexId) => {
                    const preview = evolveCreature(currentTeam[evolveSlot], dexId);
                    return (
                      <CreatureCard
                        key={dexId}
                        creature={preview}
                        hideAbility
                        onClick={() => armEvolution(evolveSlot, dexId)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
        </>
      )}

      {/* Step 2b.5 — tweak a move */}
      {mode === 'move' && (
        <>
          <RewardHeader label="Tweak a Move" />

          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
              Your team
              <span className="ml-2 text-white/35">
                {moveTeamSlot === null
                  ? 'tap a Pokémon to tweak'
                  : 'tap another to switch which Pokémon'}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {currentTeam.map((c, i) => {
                const isPicked = moveTeamSlot === i;
                const shown = moveDone && isPicked ? resultTeam[i] : c;
                return (
                  <div key={`${c.id}-${i}`} className="relative rounded-2xl">
                    <CreatureCard
                      creature={shown}
                      selected={isPicked}
                      onClick={() => pickTeamForMove(i)}
                    />
                    {moveDone && isPicked && <Tag color="emerald" text="📝 TWEAKED" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pick which move to drop. */}
          {moveTeamSlot !== null && (
            <div className="mt-7">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
                {currentTeam[moveTeamSlot].name}'s moves
                <span className="ml-2 text-white/35">tap the move to replace</span>
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {currentTeam[moveTeamSlot].moves.map((m, idx) => (
                  <MoveCard
                    key={`${m.name}-${idx}`}
                    move={m}
                    selected={moveSlotIdx === idx}
                    onClick={() => {
                      setMoveSlotIdx(idx);
                      setMoveChoice(null);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Roll the replacement: three seed-pinned options from the legal pool. */}
          {moveTeamSlot !== null && moveSlotIdx !== null && (
            <div className="mt-7">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
                Roll · pick 1 of {moveRollOptions.length} for {currentTeam[moveTeamSlot].name}
                <span className="ml-2 normal-case tracking-normal text-white/35">
                  tap a different move above to roll a new set
                </span>
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {moveRollOptions.map((m) => (
                  <MoveCard
                    key={m.name}
                    move={m}
                    selected={moveChoice?.name === m.name}
                    onClick={() => setMoveChoice(m)}
                  />
                ))}
              </div>
            </div>
          )}

          {moveDone && (
            <p className="mt-5 text-center text-sm text-white/60">
              <span className="font-bold text-white">{currentTeam[moveTeamSlot].name}</span>{' '}
              forgets <span className="text-rose-300">{currentTeam[moveTeamSlot].moves[moveSlotIdx].name}</span>{' '}
              and learns <span className="text-emerald-300">{moveChoice.name}</span>.
            </p>
          )}
        </>
      )}

      {/* Step 2c — sign reroll */}
      {mode === 'reroll' && (
        <>
          <RewardHeader label="Reroll a Sign" />

          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
              Your team
              <span className="ml-2 text-white/35">
                {rerollDone ? 'tap another to move the reroll' : 'tap a Pokémon to reroll its sign'}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {currentTeam.map((c, i) => {
                const isPicked = rerollSlot === i;
                // The card keeps showing the Pokémon's *current* sign — the
                // reroll's result is a blind gamble, hidden until they confirm.
                return (
                  <div key={`${c.id}-${i}`} className="relative rounded-2xl">
                    <CreatureCard
                      creature={c}
                      selected={isPicked}
                      onClick={() => setRerollSlot(isPicked ? null : i)}
                    />
                    {isPicked && <Tag color="violet" text="🎲 REROLL" />}
                  </div>
                );
              })}
            </div>
            {rerollDone && (
              <p className="mt-4 text-center text-sm text-white/55">
                {currentTeam[rerollSlot].name}'s sign goes to the stars. The
                result stays hidden until you continue — fate decides the rest.
              </p>
            )}
          </div>
        </>
      )}

      {/* Step 2d — ability reroll */}
      {mode === 'ability' && (
        <>
          <RewardHeader label="Reroll an Ability" />

          <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
              Your team
              <span className="ml-2 text-white/35">
                {abilitySlot !== null
                  ? rerollStrong
                    ? 'now choose its new ability below'
                    : 'tap another to move the reroll'
                  : 'tap a Pokémon with an ability pool'}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {currentTeam.map((c, i) => {
                const choosable = hasAbilityChoice(c.dexId);
                const isPicked = abilitySlot === i;
                // On a strong special the card previews the chosen ability live;
                // on a weak one it stays the current ability (a blind gamble).
                const shown =
                  rerollStrong && isPicked && abilityChoice
                    ? withAbility(c, abilityChoice)
                    : c;
                return (
                  <div key={`${c.id}-${i}`} className="relative rounded-2xl">
                    <CreatureCard
                      creature={shown}
                      selected={isPicked}
                      disabled={!choosable}
                      onClick={
                        choosable
                          ? () => {
                              setAbilitySlot(isPicked ? null : i);
                              setAbilityChoice(null);
                            }
                          : undefined
                      }
                    />
                    {isPicked && <Tag color="amber" text="✦ ABILITY" />}
                    {!choosable && <Tag color="slate" text="FIXED" />}
                  </div>
                );
              })}
            </div>

            {/* Strong special: hand-pick the new ability from the species pool. */}
            {rerollStrong && abilitySlot !== null && (
              <div className="mt-7">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
                  Choose an ability for {currentTeam[abilitySlot].name}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {abilitiesForDex(currentTeam[abilitySlot].dexId).map((id) => {
                    const info = abilityInfo(id);
                    const isCurrent = currentTeam[abilitySlot].ability === id;
                    const isSelected = abilityChoice === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => setAbilityChoice(id)}
                        className={`rounded-2xl border p-3 text-left transition-all ${
                          isCurrent
                            ? 'cursor-not-allowed border-white/10 bg-white/[0.02] opacity-50'
                            : isSelected
                              ? 'border-amber-300/60 bg-amber-300/[0.1]'
                              : 'border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.07]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-300">✦</span>
                          <span className="text-sm font-bold text-white">{info.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                              current
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-white/55">
                          {abilityDescription(id, import.meta.env.DEV)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Weak special: blind gamble, revealed on continue. */}
            {!rerollStrong && abilitySlot !== null && (
              <p className="mt-4 text-center text-sm text-white/55">
                {currentTeam[abilitySlot].name}'s ability is left to chance. The
                result stays hidden until you continue — fate decides the rest.
              </p>
            )}
          </div>
        </>
      )}

      {/* Anchored action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0c0c14]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-3 py-3 sm:px-4">
          <button
            type="button"
            onClick={() => {
              // A locked-in reroll hands off to the slot-machine reveal, which
              // calls onConfirm once the result has been shown.
              if (mode === 'reroll' && rerollDone) {
                setRolling(true);
                return;
              }
              // A weak ability reroll is also a blind gamble, so it gets the same
              // reveal. A strong one is a deliberate pick — no suspense needed.
              if (mode === 'ability' && abilityDone && !rerollStrong) {
                setRolling(true);
                return;
              }
              onConfirm(resultTeam);
            }}
            className="w-full rounded-full bg-white px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95 sm:w-auto sm:text-lg"
          >
            {continueLabel} →
          </button>
        </div>
      </div>

      {pendingMode !== null && (
        <CommitChoiceModal
          mode={pendingMode}
          onCancel={() => setPendingMode(null)}
          onConfirm={commitReward}
        />
      )}

      {pendingEvolve !== null && (
        <EvolveConfirmModal
          name={currentTeam[pendingEvolve.slot].name}
          targetName={evolveCreature(currentTeam[pendingEvolve.slot], pendingEvolve.target).name}
          onCancel={() => setPendingEvolve(null)}
          onConfirm={confirmEvolve}
        />
      )}

      {rolling && mode === 'reroll' && rerollSlot !== null && (
        <SignRollReveal
          creature={currentTeam[rerollSlot]}
          finalSign={rerolledSignFor(rerollSlot)}
          onDone={() => onConfirm(resultTeam)}
        />
      )}

      {rolling && mode === 'ability' && abilitySlot !== null && (
        <AbilityRollReveal
          creature={currentTeam[abilitySlot]}
          finalAbility={abilityResultFor(abilitySlot)}
          onDone={() => onConfirm(resultTeam)}
        />
      )}

      {revealEvolve && evolveSlot !== null && evolveTarget !== null && (
        <EvolveReveal
          from={currentTeam[evolveSlot]}
          to={evolveCreature(currentTeam[evolveSlot], evolveTarget)}
          onDone={() => onConfirm(resultTeam)}
        />
      )}
    </div>
  );
}

// Commit gate for the reward *type*. Entering a reward is a one-way door — there
// is no "change reward" once inside — so this confirms the pick first and lets
// the player opt out of seeing it again on future wins.
function CommitChoiceModal({
  mode,
  onCancel,
  onConfirm,
}: {
  mode: RewardMode;
  onCancel: () => void;
  onConfirm: (dontAskAgain: boolean) => void;
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const meta = REWARD_META[mode];
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c0c14] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/5 text-2xl">
            {meta.emoji}
          </div>
          <h3 className="mt-3 text-xl font-black text-white">Commit to {meta.title}?</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/65">{meta.commit}</p>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-center">
          <p className="text-xs font-semibold text-amber-200/90">
            Once you pick a reward you can't switch to a different one — so choose
            with care.
          </p>
        </div>

        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 text-sm text-white/55 transition hover:text-white/80">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-emerald-400"
          />
          Don't ask again
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/10"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={() => onConfirm(dontAskAgain)}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
          >
            Choose this →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Confirm gate for an individual evolution. Evolving reveals the new ability and
// can't be undone, so this stands between the pick and the reveal — the player
// commits blind, which stops them previewing each evolution's ability and backing
// out to fish for the best one. Opt-out is remembered across runs.
function EvolveConfirmModal({
  name,
  targetName,
  onCancel,
  onConfirm,
}: {
  name: string;
  targetName: string;
  onCancel: () => void;
  onConfirm: (dontAskAgain: boolean) => void;
}) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c0c14] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/5 text-2xl">
            🎟️
          </div>
          <h3 className="mt-3 text-xl font-black text-white">Evolve {name}?</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/65">
            {name} will evolve into <span className="font-bold text-white">{targetName}</span>.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-center">
          <p className="text-xs font-semibold text-amber-200/90">
            The ability it gains stays hidden until it's done — and evolving can't
            be undone, so commit before you see it.
          </p>
        </div>

        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 text-sm text-white/55 transition hover:text-white/80">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-emerald-400"
          />
          Don't ask again for evolutions
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/10"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={() => onConfirm(dontAskAgain)}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105 active:scale-95"
          >
            Evolve →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Per-tier glow for the reveal halo, mirroring the SignChip palette: the common
// twelve stay neutral, rare wanderers blaze fuchsia, the mythic Abhijit gold.
const SIGN_TIER_GLOW: Record<SignTier, string> = {
  common: 'rgba(255,255,255,0.28)',
  rare: 'rgba(232,121,249,0.6)',
  mythic: 'rgba(251,191,36,0.65)',
};

/**
 * Slot-machine reveal for the sign reroll. Spins through sign faces and eases to
 * a stop on the awarded sign, so the gamble lands with suspense and a flourish
 * instead of silently swapping the card and moving on. The result is already
 * fixed before this mounts (seed-pinned upstream) — the spin is pure theatre,
 * and the final sign's own tier drives the colour, so the hidden strong/weak
 * split is never named, only *felt* when a rare lights up the halo.
 */
function SignRollReveal({
  creature,
  finalSign,
  onDone,
}: {
  creature: Creature;
  finalSign: Sign;
  onDone: () => void;
}) {
  const [display, setDisplay] = useState<Sign>(creature.sign);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tick = 0;
    const TICKS = 22;
    const spin = () => {
      if (cancelled) return;
      tick += 1;
      if (tick >= TICKS) {
        setDisplay(finalSign);
        setSettled(true);
        return;
      }
      // Never flash the final sign mid-spin, so the landing reads as a reveal.
      const pool = ALL_SIGNS.filter((s) => s !== finalSign);
      setDisplay(pool[Math.floor(Math.random() * pool.length)]);
      // Ease-out: each frame waits a little longer, so the wheel slows to a stop.
      timer = setTimeout(spin, 38 + tick * tick * 0.7);
    };
    timer = setTimeout(spin, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [finalSign]);

  const tier = signTier(display);
  const glow = SIGN_TIER_GLOW[tier];

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/85 p-6 text-center backdrop-blur-md">
      <div className="flex flex-col items-center">
        <img
          src={creature.portrait}
          alt={creature.name}
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== creature.sprite) img.src = creature.sprite;
          }}
          className="h-20 w-20 rounded-2xl border border-white/10 bg-white/5 object-cover"
        />
        <p className="mt-2 text-sm font-bold text-white/70">{creature.name}</p>
      </div>

      <div
        className="relative grid h-40 w-40 place-items-center rounded-full border-2 transition-all duration-300"
        style={{
          borderColor: glow,
          boxShadow: settled ? `0 0 56px 10px ${glow}` : `0 0 22px 2px rgba(255,255,255,0.1)`,
          transform: settled ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        <img
          src={signIconUrl(display)}
          alt=""
          className={`h-20 w-20 object-contain ${settled ? '' : 'animate-pulse'}`}
        />
      </div>

      <div className="flex min-h-[6rem] flex-col items-center justify-center">
        {settled ? (
          <>
            <p
              className="text-xs font-black uppercase tracking-[0.2em]"
              style={{ color: tier === 'common' ? 'rgba(255,255,255,0.5)' : glow }}
            >
              {tier === 'common' ? 'New sign' : `${tier} sign`}
            </p>
            <h3 className="mt-1 text-3xl font-black text-white">{signLabel(display)}</h3>
            <p className="mt-1 max-w-xs text-sm text-white/60">{SIGN_INFO[display].tagline}</p>
          </>
        ) : (
          <p className="animate-pulse text-lg font-black uppercase tracking-[0.3em] text-white/70">
            Rerolling…
          </p>
        )}
      </div>

      {settled && (
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-white px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95"
        >
          Continue →
        </button>
      )}
    </div>,
    document.body,
  );
}

/**
 * Slot-machine reveal for the (weak) ability reroll — the sibling of
 * SignRollReveal. Spins through the species' ability pool and lands on the
 * awarded ability, so a blind gamble gets the same beat of suspense. The result
 * is already fixed before this mounts (seed-pinned upstream); the spin is pure
 * theatre.
 */
function AbilityRollReveal({
  creature,
  finalAbility,
  onDone,
}: {
  creature: Creature;
  finalAbility: AbilityId | undefined;
  onDone: () => void;
}) {
  const [display, setDisplay] = useState<AbilityId | undefined>(creature.ability);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tick = 0;
    const TICKS = 22;
    // Spin through the species' other options so the landing reads as a reveal.
    const pool = abilitiesForDex(creature.dexId).filter((id) => id !== finalAbility);
    const spin = () => {
      if (cancelled) return;
      tick += 1;
      if (tick >= TICKS || pool.length === 0) {
        setDisplay(finalAbility);
        setSettled(true);
        return;
      }
      setDisplay(pool[Math.floor(Math.random() * pool.length)]);
      timer = setTimeout(spin, 38 + tick * tick * 0.7);
    };
    timer = setTimeout(spin, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [creature.dexId, finalAbility]);

  const info = display ? abilityInfo(display) : null;
  const glow = 'rgba(252,211,77,0.6)';

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/85 p-6 text-center backdrop-blur-md">
      <div className="flex flex-col items-center">
        <img
          src={creature.portrait}
          alt={creature.name}
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== creature.sprite) img.src = creature.sprite;
          }}
          className="h-20 w-20 rounded-2xl border border-white/10 bg-white/5 object-cover"
        />
        <p className="mt-2 text-sm font-bold text-white/70">{creature.name}</p>
      </div>

      <div
        className="relative grid h-40 w-40 place-items-center rounded-full border-2 transition-all duration-300"
        style={{
          borderColor: glow,
          boxShadow: settled ? `0 0 56px 10px ${glow}` : `0 0 22px 2px rgba(255,255,255,0.1)`,
          transform: settled ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        <span className={`text-5xl ${settled ? '' : 'animate-pulse'}`}>✦</span>
      </div>

      <div className="flex min-h-[6rem] flex-col items-center justify-center">
        {settled && info ? (
          <>
            <p
              className="text-xs font-black uppercase tracking-[0.2em]"
              style={{ color: glow }}
            >
              New ability
            </p>
            <h3 className="mt-1 text-3xl font-black text-white">{info.name}</h3>
            <p className="mt-1 max-w-xs text-sm text-white/60">
              {abilityDescription(info.id, import.meta.env.DEV)}
            </p>
          </>
        ) : (
          <p className="animate-pulse text-lg font-black uppercase tracking-[0.3em] text-white/70">
            Rerolling…
          </p>
        )}
      </div>

      {settled && (
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-white px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95"
        >
          Continue →
        </button>
      )}
    </div>,
    document.body,
  );
}

/**
 * Evolution reveal — the evolve reward's answer to SignRollReveal /
 * AbilityRollReveal. The committed result is already fixed upstream, so this is
 * pure theatre: the portrait flickers between the old and new forms, glowing
 * brighter and faster (ease-*in*, opposite of the slot machines' ease-out) until
 * a white burst resolves onto the evolved Pokémon — then the new form and the
 * ability it gained (kept hidden until this moment) are revealed, with a clear
 * way out instead of leaving the player stranded on the board.
 */
function EvolveReveal({
  from,
  to,
  onDone,
}: {
  from: Creature;
  to: Creature;
  onDone: () => void;
}) {
  // 'spin' flickers between the two forms; 'flash' is the white burst that masks
  // the swap onto the evolved form; 'done' settles with the reveal.
  const [phase, setPhase] = useState<'spin' | 'flash' | 'done'>('spin');
  const [showEvolved, setShowEvolved] = useState(false);
  // 0→1 over the spin, driving the swelling glow and the wash toward white.
  const [intensity, setIntensity] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tick = 0;
    const TICKS = 18;
    const spin = () => {
      if (cancelled) return;
      tick += 1;
      setIntensity(tick / TICKS);
      if (tick >= TICKS) {
        // Snap to the evolved form behind a full white burst, then resolve.
        setShowEvolved(true);
        setPhase('flash');
        timer = setTimeout(() => {
          if (!cancelled) setPhase('done');
        }, 380);
        return;
      }
      setShowEvolved((v) => !v);
      // Ease-in: the flicker accelerates as the evolution nears.
      timer = setTimeout(spin, Math.max(60, 300 - tick * 16));
    };
    timer = setTimeout(spin, 360);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const settled = phase === 'done';
  const current = showEvolved ? to : from;
  const ability = to.ability ? abilityInfo(to.ability) : null;
  const gainedAbility = ability !== null && to.ability !== from.ability;
  // Warm gold for the settled glow, mirroring the EVOLVED tag's amber.
  const glow = 'rgba(255,221,148,0.7)';

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/85 p-6 text-center backdrop-blur-md">
      <div className="flex min-h-[1.5rem] items-center">
        {!settled && (
          <p className="animate-pulse text-sm font-bold text-white/70">
            {from.name} is evolving…
          </p>
        )}
      </div>

      <div
        className="relative grid h-44 w-44 place-items-center overflow-hidden rounded-full border-2 transition-all duration-300"
        style={{
          borderColor: glow,
          boxShadow: settled
            ? `0 0 60px 12px ${glow}`
            : `0 0 ${12 + intensity * 44}px ${2 + intensity * 9}px rgba(255,255,255,${0.12 + intensity * 0.5})`,
          transform: settled ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        <img
          src={current.portrait}
          alt=""
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== current.sprite) img.src = current.sprite;
          }}
          className="h-24 w-24 rounded-2xl object-cover"
          style={{
            filter: settled ? 'none' : `brightness(${1 + intensity * 1.9})`,
            transform: settled ? 'scale(1)' : `scale(${1 + intensity * 0.06})`,
          }}
        />
        {/* Climactic white burst — instant up (no transition), slow fade out — so
            the swap onto the evolved form happens fully hidden behind the flash. */}
        <div
          className={`pointer-events-none absolute inset-0 bg-white ${
            phase === 'flash' ? '' : 'transition-opacity duration-500'
          }`}
          style={{ opacity: phase === 'flash' ? 1 : 0 }}
        />
      </div>

      <div className="flex min-h-[7rem] flex-col items-center justify-center">
        {settled ? (
          <>
            <p
              className="text-xs font-black uppercase tracking-[0.2em]"
              style={{ color: glow }}
            >
              Evolved
            </p>
            <h3 className="mt-1 text-3xl font-black text-white">
              {from.name} → {to.name}
            </h3>
            {ability && (
              <p className="mt-2 max-w-xs text-sm text-white/65">
                <span className="font-bold text-amber-200">
                  {gainedAbility ? 'New ability: ' : 'Ability: '}
                </span>
                <span className="font-bold text-white">{ability.name}</span> —{' '}
                {abilityDescription(ability.id, import.meta.env.DEV)}
              </p>
            )}
          </>
        ) : (
          <p className="animate-pulse text-lg font-black uppercase tracking-[0.3em] text-white/70">
            Evolving…
          </p>
        )}
      </div>

      {settled && (
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-white px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95"
        >
          Continue →
        </button>
      )}
    </div>,
    document.body,
  );
}

function RewardOption({
  emoji,
  title,
  desc,
  preview,
  disabled = false,
  onClick,
}: {
  emoji: string;
  title: string;
  desc: string;
  preview?: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group flex flex-col items-center rounded-3xl border p-6 text-center transition-all ${
        disabled
          ? 'cursor-not-allowed border-white/10 bg-white/[0.02] opacity-50'
          : 'border-white/10 bg-white/[0.03] hover:scale-[1.02] hover:border-white/30 hover:bg-white/[0.07]'
      }`}
    >
      <div className="text-5xl">{emoji}</div>
      <h3 className="mt-3 text-lg font-black text-white">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-white/55">{desc}</p>
      {preview}
    </button>
  );
}

/** A compact row of creature portraits previewing what a reward offers. */
function PreviewRow({ creatures }: { creatures: Creature[] }) {
  if (creatures.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      {creatures.map((c, i) => (
        <img
          key={`${c.id}-${i}`}
          src={c.portrait}
          alt={c.name}
          title={c.name}
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.src !== c.sprite) img.src = c.sprite;
          }}
          className="h-10 w-10 rounded-lg border border-white/10 bg-white/5 object-cover"
        />
      ))}
    </div>
  );
}

// A tappable move card for the "Tweak a Move" reward — names the move, its
// damage category & power, its type, and any secondary effect or self-cost rider
// so the player can weigh a swap the same way the moveset modal presents it.
const CATEGORY_ICON: Record<MoveCategory, string> = {
  physical: '💥',
  energy: '✦',
  status: '◇',
};

// A tappable, type-tinted move card for the "Tweak a Move" reward. Its border,
// background wash and corner glow take the move's elemental colour; a damage move
// shows a power bar, a status move says so plainly, and any secondary effect or
// self-cost rider reads as a pill — the same facts the moveset modal presents,
// dressed up so a roll of three is easy to weigh at a glance. Selecting one lays
// an emerald ring (the screen's "chosen" colour) over the type tint, so the pick
// is unmistakable across all eighteen type hues.
function MoveCard({
  move,
  selected,
  onClick,
}: {
  move: Move;
  selected: boolean;
  onClick: () => void;
}) {
  const color = TYPE_COLORS[move.type];
  const cat = moveCategory(move);
  const effect = move.effect ? moveEffectLabel(move.effect) : null;
  const self = moveSelfNote(move);
  const isDamage = move.power > 0;
  const fill = Math.max(0.1, Math.min(1, move.power / 130));
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderColor: selected ? color : `${color}59`,
        backgroundColor: selected ? `${color}24` : `${color}12`,
        boxShadow: selected
          ? `0 0 0 2px #34d399, 0 12px 30px -12px ${color}cc`
          : `0 8px 22px -16px ${color}cc`,
      }}
      className="group relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110"
    >
      {/* Type-coloured glow bleeding in from the top corner. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full opacity-40 blur-2xl"
        style={{ backgroundColor: color }}
      />

      {/* Type badge (left) + damage category (right, with a tick once chosen). */}
      <div className="relative flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: `${color}26`, color }}
        >
          <img src={typeIconUrl(move.type)} alt="" className="h-3.5 w-3.5 object-contain" />
          {typeLabel(move.type)}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
          {selected && <span className="text-sm font-black text-emerald-300">✓</span>}
          <span>
            {CATEGORY_ICON[cat]} {moveCategoryLabel(move)}
          </span>
        </span>
      </div>

      {/* Move name. */}
      <div className="relative text-[15px] font-extrabold leading-tight text-white">
        {move.name}
      </div>

      {/* Power bar for damage moves; a quiet tag for status moves. */}
      {isDamage ? (
        <div className="relative flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full"
              style={{ width: `${fill * 100}%`, backgroundColor: color }}
            />
          </span>
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/70">
            {move.power} POW
          </span>
        </div>
      ) : (
        <div className="relative text-[11px] font-semibold uppercase tracking-wide text-white/40">
          No direct damage
        </div>
      )}

      {/* Secondary effect + any self-cost rider, as pills. */}
      {(effect || self) && (
        <div className="relative flex flex-wrap gap-1.5">
          {effect && (
            <span className="rounded-md bg-sky-300/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-200/90">
              {effect}
            </span>
          )}
          {self && (
            <span className="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-200/90">
              {self}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// Per-tier colouring for a sign chip: rare wanderers glow violet, the mythic
// Abhijit glows gold, and the common twelve stay neutral — so a recruit's rare
// luck reads at a glance before you even open the full card.
const SIGN_TIER_CHIP: Record<SignTier, string> = {
  common: 'border-white/10 bg-white/10 text-white/70',
  rare: 'border-fuchsia-300/45 bg-fuchsia-300/10 text-fuchsia-200',
  mythic: 'border-amber-300/50 bg-amber-300/10 text-amber-200',
};

function SignChip({ sign }: { sign: Sign }) {
  const tier = signTier(sign);
  return (
    <span
      title={signSummary(sign)}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SIGN_TIER_CHIP[tier]}`}
    >
      <img src={signIconUrl(sign)} alt="" className="h-3 w-3 shrink-0 object-contain" />
      <span className="truncate">{signLabel(sign)}</span>
      {tier !== 'common' && (
        <span className="text-[8px] font-black uppercase tracking-wide opacity-80">{tier}</span>
      )}
    </span>
  );
}

/**
 * Detailed recruit preview: each defeated foe shown as it would join you, with
 * its portrait, sign (colour-coded by rarity), ability and shiny lustre — so the
 * player can weigh the actual recruits before committing to the reward.
 */
function RecruitPreview({ creatures }: { creatures: Creature[] }) {
  if (creatures.length === 0) return null;
  return (
    <div className="mt-4 w-full space-y-1.5">
      {creatures.map((c, i) => {
        const ability = c.ability ? abilityInfo(c.ability) : null;
        return (
          <div
            key={`${c.id}-${i}`}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 text-left"
          >
            <img
              src={c.portrait}
              alt={c.name}
              loading="lazy"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src !== c.sprite) img.src = c.sprite;
              }}
              className="h-9 w-9 shrink-0 rounded-lg border border-white/10 bg-white/5 object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-bold text-white">{c.name}</span>
                {c.shiny && (
                  <span
                    title={`Shiny — a rare colour variant with a flat stat boost`}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 text-[9px] font-black"
                    style={{
                      background: 'linear-gradient(90deg, #ffe9a8, #ffd76b, #bfefff)',
                      color: '#5c3b00',
                    }}
                  >
                    ✦ Shiny
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <SignChip sign={c.sign} />
                {ability && (
                  <span
                    title={abilityDescription(ability.id, import.meta.env.DEV)}
                    className="inline-flex min-w-0 items-center gap-1 rounded-md border border-amber-300/25 bg-amber-300/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-amber-200/90"
                  >
                    <span className="shrink-0 text-[9px] text-amber-300">✦</span>
                    <span className="truncate">{ability.name}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// No "change reward" escape hatch here by design: picking a reward is a
// commitment locked in at the choose step's confirmation gate, so once you're
// inside a reward you can only complete it (or skip your reward entirely).
function RewardHeader({ label }: { label: string }) {
  return (
    <div className="mt-7 flex items-center justify-between border-b border-white/10 pb-2">
      <span className="text-xs font-bold uppercase tracking-widest text-white/40">{label}</span>
      <span className="text-xs font-semibold uppercase tracking-widest text-white/30">
        Locked in
      </span>
    </div>
  );
}

function Tag({
  color,
  text,
}: {
  color: 'emerald' | 'amber' | 'slate' | 'violet';
  text: string;
}) {
  const bg =
    color === 'emerald'
      ? 'bg-emerald-400 text-black'
      : color === 'amber'
        ? 'bg-amber-400 text-black'
        : color === 'violet'
          ? 'bg-violet-400 text-black'
          : 'bg-slate-600 text-white';
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${bg}`}>{text}</span>
    </div>
  );
}
