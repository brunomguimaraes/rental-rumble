import { useState } from 'react';
import type { Creature, Sign } from '../game/types';
import type { BracketId } from '../game/gens';
import {
  canEvolve,
  evolutionTargets,
  evolveCreature,
  withSign,
  asShiny,
  canBeShiny,
  withRandomPortrait,
  sameFamily,
} from '../game/pokemon';
import { rerollSign, forcedRareSign } from '../game/zodiac';
import { allRareEnabled, allShinyEnabled } from '../game/dev';
import { SHINY_CHANCE } from '../game/run';
import { RNG } from '../game/rng';
import { CreatureCard } from './CreatureCard';
import { CupIcon } from './CupIcon';

type Mode = 'choose' | 'recruit' | 'evolve' | 'reroll';

export function RecruitScreen({
  opponentName,
  nextLabel,
  bracket,
  currentTeam,
  defeatedTeam,
  allowSignReroll = false,
  rerollSeed,
  onConfirm,
}: {
  opponentName: string;
  nextLabel: string;
  bracket: BracketId;
  currentTeam: Creature[];
  defeatedTeam: Creature[];
  // Whether the rare "reroll a sign" reward is offered (set after the run's last
  // special trainer). `rerollSeed` pins the outcome deterministically so the
  // gamble can't be re-rolled by leaving and re-entering the screen.
  allowSignReroll?: boolean;
  rerollSeed?: string;
  onConfirm: (team: Creature[]) => void;
}) {
  const [mode, setMode] = useState<Mode>('choose');

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
  const rerolledSignFor = (i: number): Sign =>
    rerollSign(
      currentTeam[i].stats,
      new RNG(rerollSeed ?? 'reroll'),
      currentTeam[i].sign,
    );

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

  // The team we'd hand back if the player confirms right now.
  const resultTeam = currentTeam.map((c, i) => {
    if (mode === 'recruit' && recruitDone && i === recruitSlot) return defeatedView[foeIdx];
    if (mode === 'evolve' && evolveDone && i === evolveSlot) return evolveCreature(c, evolveTarget);
    if (mode === 'reroll' && rerollDone && i === rerollSlot) return withSign(c, rerolledSignFor(i));
    return c;
  });

  const backToChoose = () => {
    setMode('choose');
    setFoeIdx(null);
    setRecruitSlot(null);
    setEvolveSlot(null);
    setEvolveTarget(null);
    setRerollSlot(null);
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
  const rewardChosen = recruitDone || evolveDone || rerollDone;
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
                : 'Pick one of your team to reroll its sign — fate decides the rest.'}
        </p>
      </div>

      {/* Step 1 — choose your reward */}
      {mode === 'choose' && (
        <div
          className={`mt-8 grid gap-4 sm:grid-cols-2 ${allowSignReroll ? 'lg:grid-cols-3' : ''}`}
        >
          <RewardOption
            emoji="🔄"
            title="Recruit a Pokémon"
            desc={`Swap one of ${opponentName}'s Pokémon into your team — keeps its sign & ball.`}
            preview={<PreviewRow creatures={defeatedView} />}
            onClick={() => setMode('recruit')}
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
            onClick={() => anyEvolvable && setMode('evolve')}
          />
          {allowSignReroll && (
            <RewardOption
              emoji="🎲"
              title="Reroll a Sign"
              desc="Gamble one of your team's zodiac signs for a brand-new one. Who knows what the stars hold?"
              preview={<PreviewRow creatures={currentTeam} />}
              onClick={() => setMode('reroll')}
            />
          )}
        </div>
      )}

      {/* Step 2a — recruit */}
      {mode === 'recruit' && (
        <>
          <RewardHeader onBack={backToChoose} label="Recruiting from defeated team" />

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
          <RewardHeader onBack={backToChoose} label="Evolution Ticket" />

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
          <RewardHeader onBack={backToChoose} label="Reroll a Sign" />

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
            onClick={() => onConfirm(resultTeam)}
            className="w-full rounded-full bg-white px-8 py-3 text-base font-bold text-black transition-transform hover:scale-105 active:scale-95 sm:w-auto sm:text-lg"
          >
            {continueLabel} →
          </button>
        </div>
      </div>
    </div>
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

function RewardHeader({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <div className="mt-7 flex items-center justify-between border-b border-white/10 pb-2">
      <span className="text-xs font-bold uppercase tracking-widest text-white/40">{label}</span>
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-white/50 underline-offset-2 hover:underline"
      >
        ← Change reward
      </button>
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
