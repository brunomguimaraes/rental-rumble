import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AbilityId, Creature, Sign } from '../game/types';
import type { BracketId } from '../game/gens';
import {
  canEvolve,
  evolutionTargets,
  evolveCreature,
  withSign,
  withAbility,
  asShiny,
  canBeShiny,
  withRandomPortrait,
  sameFamily,
} from '../game/pokemon';
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
  abilityInfo,
  abilitiesForDex,
  hasAbilityChoice,
  rerollAbility,
} from '../game/abilities';
import { allRareEnabled, allShinyEnabled } from '../game/dev';
import { SHINY_CHANCE } from '../game/run';
import { RNG } from '../game/rng';
import { CreatureCard } from './CreatureCard';
import { CupIcon } from './CupIcon';

type Mode = 'choose' | 'recruit' | 'evolve' | 'reroll' | 'ability';
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

  // Reward 2 — evolution ticket: evolve exactly one of YOUR Pokémon.
  const [evolveSlot, setEvolveSlot] = useState<number | null>(null);
  const [evolveTarget, setEvolveTarget] = useState<number | null>(null);

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
    const shinyRoll = shinyRng.chance(SHINY_CHANCE);
    if (!view.shiny && (allShiny || shinyRoll) && canBeShiny(view.dexId)) {
      view = withRandomPortrait(asShiny(view), shinyRng);
    }
    return view;
  };
  const defeatedView = defeatedTeam.map(recruitView);

  // A team can't hold two members of the same evolutionary line. Recruiting swaps
  // a foe into one slot, so a slot is only a legal target if no *other* slot
  // already holds a mon from the foe's family — letting you swap a foe onto its
  // own line (e.g. trade your Ivysaur for their Venusaur) while still blocking a
  // duplicate line. A foe with no legal slot at all can't be recruited.
  const recruitSlotAllowed = (foe: Creature, slot: number) =>
    currentTeam.every((c, j) => j === slot || !sameFamily(c.dexId, foe.dexId));
  const canRecruitFoe = (foe: Creature) =>
    currentTeam.some((_, slot) => recruitSlotAllowed(foe, slot));

  const anyEvolvable = currentTeam.some((c) => canEvolve(c, bracket));

  const recruitDone = foeIdx !== null && recruitSlot !== null;
  const evolveDone = evolveSlot !== null && evolveTarget !== null;
  const rerollDone = rerollSlot !== null;
  // A strong special needs an explicit pick; a weak one is locked in by the slot
  // alone (the result is a blind gamble revealed on confirm).
  const abilityDone =
    abilitySlot !== null && (!rerollStrong || abilityChoice !== null);

  // The team we'd hand back if the player confirms right now.
  const resultTeam = currentTeam.map((c, i) => {
    if (mode === 'recruit' && recruitDone && i === recruitSlot) return defeatedView[foeIdx];
    if (mode === 'evolve' && evolveDone && i === evolveSlot) return evolveCreature(c, evolveTarget);
    if (mode === 'reroll' && rerollDone && i === rerollSlot) return withSign(c, rerolledSignFor(i));
    if (mode === 'ability' && abilityDone && i === abilitySlot)
      return withAbility(c, abilityResultFor(i));
    return c;
  });

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

  const pickTeamForEvolve = (i: number) => {
    const targets = evolutionTargets(currentTeam[i].dexId, bracket);
    if (targets.length === 0) return;
    setEvolveSlot(i);
    setEvolveTarget(targets.length === 1 ? targets[0] : null);
  };

  // A reward is only "claimed" once it's fully chosen. Until then — in any mode,
  // including after you've stepped into recruit/evolve — the player can still
  // skip outright and move on with their current team.
  const rewardChosen = recruitDone || evolveDone || rerollDone || abilityDone;
  const continueLabel = rewardChosen ? nextLabel : 'Skip reward';

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
          className={`mt-8 grid gap-4 sm:grid-cols-2 ${allowSignReroll ? 'lg:grid-cols-4' : ''}`}
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
          {allowSignReroll && (
            <RewardOption
              emoji="🎲"
              title="Reroll a Sign"
              desc="Gamble one of your team's zodiac signs for a brand-new one. Who knows what the stars hold?"
              preview={<PreviewRow creatures={currentTeam} />}
              onClick={() => chooseReward('reroll')}
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
                const shown = evolveDone && isPicked ? evolveCreature(c, evolveTarget) : c;
                return (
                  <div key={`${c.id}-${i}`} className="relative rounded-2xl">
                    <CreatureCard
                      creature={shown}
                      selected={isPicked}
                      disabled={!evolvable}
                      onClick={evolvable ? () => pickTeamForEvolve(i) : undefined}
                    />
                    {evolveDone && isPicked && <Tag color="amber" text="EVOLVED" />}
                    {!evolvable && <Tag color="slate" text="MAX" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Branched lines: let the player choose which evolution to take. */}
          {evolveSlot !== null && evolutionTargets(currentTeam[evolveSlot].dexId, bracket).length > 1 && (
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
                      selected={evolveTarget === dexId}
                      onClick={() => setEvolveTarget(dexId)}
                    />
                  );
                })}
              </div>
            </div>
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

      {rolling && rerollSlot !== null && (
        <SignRollReveal
          creature={currentTeam[rerollSlot]}
          finalSign={rerolledSignFor(rerollSlot)}
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
                    title={ability.description}
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
