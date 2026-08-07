import { useMemo } from 'react';
import { ownedMonToCreature, type CatchResult, type OwnedMon } from '../game/box';
import { MiniSprite } from './MiniSprite';

// Shown after a Catch run resolves. On a clear it celebrates the freshly-minted
// mon (server-authoritative) and lists which party members leveled up; on a
// failure it's a gentle "no catch this time".

export function CatchResultScreen({
  result,
  onDone,
  onAgain,
}: {
  result: CatchResult;
  onDone: () => void;
  onAgain: () => void;
}) {
  const caught = result.caught;
  const creature = useMemo(
    () => (caught ? ownedMonToCreature(caught) : null),
    [caught],
  );
  const boxById = useMemo(() => {
    const m = new Map<string, OwnedMon>();
    for (const o of result.box ?? []) m.set(o.id, o);
    return m;
  }, [result.box]);

  if (!result.cleared || !caught || !creature) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <span className="text-5xl">💫</span>
        <h1 className="mt-4 text-2xl font-black text-white">Your team fainted</h1>
        <p className="mt-2 max-w-sm text-white/60">
          {result.error ?? 'No catch this time. Train up and try again.'}
        </p>
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={onAgain}
            className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95"
          >
            Back to hub
          </button>
        </div>
      </div>
    );
  }

  const rarity = creature.shiny ? 'Shiny!' : creature.altColor ? 'Alt colour' : null;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      <div className="text-sm font-bold uppercase tracking-widest text-emerald-300">
        Gotcha!
      </div>
      <div className="relative mt-4">
        <img
          src={creature.portrait}
          alt={creature.name}
          className="h-40 w-40 rounded-3xl border border-white/10 bg-white/[0.03] object-contain [image-rendering:pixelated]"
        />
        {creature.shiny && (
          <span className="shiny-twinkle absolute -right-1 -top-1 text-lg" style={{ color: '#ffd76b' }}>
            ✦
          </span>
        )}
      </div>
      <h1 className="mt-4 text-2xl font-black text-white">{creature.name}</h1>
      <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/60">
        <span>Lv {caught.level}</span>
        {rarity && <span className="text-amber-300">· {rarity}</span>}
      </div>
      <p className="mt-2 text-sm text-white/50">
        Added to your box. Bring it on catch runs to raise its level.
      </p>

      {result.levelUps && result.levelUps.length > 0 && (
        <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-widest text-white/40">
            Level ups
          </div>
          <ul className="space-y-2">
            {result.levelUps.map((lu) => {
              const mon = boxById.get(lu.id);
              const c = mon ? ownedMonToCreature(mon) : null;
              return (
                <li key={lu.id} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-white/80">
                    {c && <MiniSprite creature={c} className="h-6 w-6" />}
                    {c?.name ?? 'Pokémon'}
                  </span>
                  <span className="text-sm font-bold text-emerald-300">
                    Lv {lu.fromLevel} → {lu.toLevel}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.08]"
        >
          Catch again
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95"
        >
          Back to hub
        </button>
      </div>
    </div>
  );
}
