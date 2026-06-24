import { useState } from 'react';
import type { Creature } from '../game/types';
import type { BracketId } from '../game/gens';
import { canEvolve, evolutionTargets, evolveCreature } from '../game/pokemon';
import { CreatureCard } from './CreatureCard';
import { CupIcon } from './CupIcon';

type Mode = 'choose' | 'recruit' | 'evolve';

export function RecruitScreen({
  opponentName,
  nextLabel,
  bracket,
  currentTeam,
  defeatedTeam,
  onConfirm,
}: {
  opponentName: string;
  nextLabel: string;
  bracket: BracketId;
  currentTeam: Creature[];
  defeatedTeam: Creature[];
  onConfirm: (team: Creature[]) => void;
}) {
  const [mode, setMode] = useState<Mode>('choose');

  // Reward 1 — recruit: take exactly one foe Pokémon into one of your slots.
  const [foeIdx, setFoeIdx] = useState<number | null>(null);
  const [recruitSlot, setRecruitSlot] = useState<number | null>(null);

  // Reward 2 — evolution ticket: evolve exactly one of YOUR Pokémon.
  const [evolveSlot, setEvolveSlot] = useState<number | null>(null);
  const [evolveTarget, setEvolveTarget] = useState<number | null>(null);

  const anyEvolvable = currentTeam.some((c) => canEvolve(c, bracket));

  const recruitDone = foeIdx !== null && recruitSlot !== null;
  const evolveDone = evolveSlot !== null && evolveTarget !== null;

  // The team we'd hand back if the player confirms right now.
  const resultTeam = currentTeam.map((c, i) => {
    if (mode === 'recruit' && recruitDone && i === recruitSlot) return defeatedTeam[foeIdx];
    if (mode === 'evolve' && evolveDone && i === evolveSlot) return evolveCreature(c, evolveTarget);
    return c;
  });

  const backToChoose = () => {
    setMode('choose');
    setFoeIdx(null);
    setRecruitSlot(null);
    setEvolveSlot(null);
    setEvolveTarget(null);
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
  const rewardChosen = recruitDone || evolveDone;
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
              : 'Spend your Evolution Ticket on one of your team — pick a Pokémon to evolve.'}
        </p>
      </div>

      {/* Step 1 — choose your reward */}
      {mode === 'choose' && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <RewardOption
            emoji="🔄"
            title="Recruit a Pokémon"
            desc={`Swap one of ${opponentName}'s Pokémon into your team — keeps its sign & ball.`}
            preview={<PreviewRow creatures={defeatedTeam} />}
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
                const swapped = recruitDone && i === recruitSlot;
                return (
                  <div
                    key={`${c.id}-${i}`}
                    className={`relative rounded-2xl ${armed ? 'ring-2 ring-emerald-300/60' : ''}`}
                  >
                    <CreatureCard
                      creature={c}
                      onClick={armed ? () => setRecruitSlot(i) : undefined}
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
              {defeatedTeam.map((c, i) => (
                <CreatureCard
                  key={i}
                  creature={c}
                  selected={foeIdx === i}
                  onClick={() => {
                    setFoeIdx(foeIdx === i ? null : i);
                    setRecruitSlot(null);
                  }}
                />
              ))}
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
                  <div
                    key={`${c.id}-${i}`}
                    className={`relative rounded-2xl ${isPicked ? 'ring-2 ring-amber-300/70' : ''}`}
                  >
                    <CreatureCard
                      creature={shown}
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

function Tag({ color, text }: { color: 'emerald' | 'amber' | 'slate'; text: string }) {
  const bg =
    color === 'emerald'
      ? 'bg-emerald-400 text-black'
      : color === 'amber'
        ? 'bg-amber-400 text-black'
        : 'bg-slate-600 text-white';
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${bg}`}>{text}</span>
    </div>
  );
}
