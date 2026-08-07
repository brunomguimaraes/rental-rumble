import { useMemo } from 'react';
import type { AccountUser } from '../game/account';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { MAX_LEVEL } from '../game/levels';
import { MiniSprite } from './MiniSprite';

// The home screen after sign-in: a mixed hub. The player's collection is the
// emotional centre; one big "start a run" choice (Catch / Rental) is always a
// tap away. Secondary destinations (Dex, Ladder, Guide, Account) sit as quiet
// chrome, not a control panel.

function BoxMon({ mon }: { mon: OwnedMon }) {
  const creature = useMemo(() => ownedMonToCreature(mon), [mon]);
  if (!creature) return null;
  const maxed = mon.level >= MAX_LEVEL;
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <MiniSprite creature={creature} className="h-10 w-10" />
      </div>
      <div className="w-full truncate text-center text-[10px] text-white/60" title={creature.name}>
        {creature.name}
      </div>
      <div
        className={`text-[10px] font-bold ${maxed ? 'text-amber-300' : 'text-white/50'}`}
      >
        Lv {mon.level}
      </div>
    </div>
  );
}

export function HubScreen({
  me,
  box,
  onCatch,
  onRental,
  onViewDex,
  onViewLadder,
  onViewGuide,
  onViewAccount,
}: {
  me: AccountUser;
  box: OwnedMon[];
  onCatch: () => void;
  onRental: () => void;
  onViewDex: () => void;
  onViewLadder: () => void;
  onViewGuide: () => void;
  onViewAccount: () => void;
}) {
  const strongest = useMemo(
    () => [...box].sort((a, b) => b.level - a.level).slice(0, 12),
    [box],
  );
  const recent = box.slice(0, 12); // already newest-first from the API
  const empty = box.length === 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 py-8 sm:px-6">
      {/* Brand + trainer */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
            alt="Poké Ball"
            className="h-9 w-9 object-contain [image-rendering:pixelated]"
          />
          <div>
            <div className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-xl font-black tracking-tight text-transparent">
              RENTAL RUMBLE
            </div>
            <div className="text-xs text-white/50">
              Welcome back, {me.displayName || 'Trainer'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onViewAccount}
          className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.08]"
        >
          Account
        </button>
      </header>

      {/* Collection strip */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">
            Your collection
          </h2>
          <span className="text-xs text-white/40">{box.length} caught</span>
        </div>

        {empty ? (
          <button
            type="button"
            onClick={onCatch}
            className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center transition hover:bg-white/[0.05]"
          >
            <span className="text-3xl">🌿</span>
            <span className="text-sm font-semibold text-white">
              Your box is empty
            </span>
            <span className="max-w-xs text-xs text-white/50">
              Head into the tall grass and catch your very first partner.
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs text-white/40">Recently caught</div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {recent.map((m) => (
                  <BoxMon key={m.id} mon={m} />
                ))}
              </div>
            </div>
            {box.length > 1 && (
              <div>
                <div className="mb-2 text-xs text-white/40">Strongest</div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {strongest.map((m) => (
                    <BoxMon key={m.id} mon={m} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Primary run choices */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCatch}
          className="group flex flex-col items-start gap-1 rounded-3xl bg-gradient-to-br from-emerald-400/90 to-teal-500/90 px-6 py-5 text-left text-black shadow-lg transition hover:scale-[1.01] active:scale-[0.99]"
        >
          <span className="text-lg font-black">Catch Run</span>
          <span className="text-sm font-medium text-black/70">
            {empty ? 'Catch your first partner' : 'Explore a zone, catch a new mon, train your team'}
          </span>
        </button>
        <button
          type="button"
          onClick={onRental}
          className="group flex flex-col items-start gap-1 rounded-3xl border border-white/15 bg-white/[0.04] px-6 py-5 text-left text-white transition hover:bg-white/[0.08]"
        >
          <span className="text-lg font-black">Rental Gauntlet</span>
          <span className="text-sm font-medium text-white/60">
            Draft six rentals and climb from rookie to Champion
          </span>
        </button>
      </section>

      {/* Secondary chrome */}
      <nav className="mt-auto flex flex-wrap justify-center gap-2 pt-10 text-xs">
        {[
          { label: 'Pokédex', on: onViewDex },
          { label: 'Ladder', on: onViewLadder },
          { label: 'Guide', on: onViewGuide },
        ].map((l) => (
          <button
            key={l.label}
            type="button"
            onClick={l.on}
            className="rounded-full border border-white/10 bg-white/[0.02] px-4 py-1.5 font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          >
            {l.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
