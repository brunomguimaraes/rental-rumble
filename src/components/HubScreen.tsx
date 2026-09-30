import { useMemo } from 'react';
import type { AccountUser } from '../game/account';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import type { Profile } from '../game/profile';
import { professorById } from '../game/professions';
import { MAX_LEVEL } from '../game/levels';
import { MiniSprite } from './MiniSprite';
import { Credits } from './Credits';
import { PrivacyPolicy } from './PrivacyPolicy';

function BoxMon({ mon }: { mon: OwnedMon }) {
  const creature = useMemo(() => ownedMonToCreature(mon), [mon]);
  if (!creature) return null;
  const maxed = mon.level >= MAX_LEVEL;
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]">
        <MiniSprite creature={creature} className="h-10 w-10" />
      </div>
      <div className="w-full truncate text-center text-[10px] text-white/60" title={creature.name}>{creature.name}</div>
      <div className={`text-[10px] font-bold ${maxed ? 'text-amber-300' : 'text-white/50'}`}>Lv {mon.level}</div>
    </div>
  );
}

export function HubScreen({
  me, box, profile,
  onViewBox, onViewDex, onViewGuide, onViewAccount,
}: {
  me: AccountUser;
  box: OwnedMon[];
  profile: Profile;
  onViewBox: () => void;
  onViewDex: () => void;
  onViewGuide: () => void;
  onViewAccount: () => void;
}) {
  const recent = box.slice(0, 12);
  const professor = professorById(profile.mentor);
  const starter = box.find((m) => m.id === profile.starterId);
  const starterCreature = starter ? ownedMonToCreature(starter) : null;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`} alt="" className="h-9 w-9 object-contain [image-rendering:pixelated]" />
          <div>
            <div className="bg-gradient-to-br from-white to-white/50 bg-clip-text text-xl font-black tracking-tight text-transparent">TRAINER {me.displayName?.toUpperCase() || ''}</div>
            <div className="text-xs text-white/50">{professor?.name ?? 'Professor'}’s protégé{starterCreature ? ` · partner: ${starterCreature.name}` : ''}</div>
          </div>
        </div>
        <button type="button" onClick={onViewAccount} className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/[0.08]">Account</button>
      </header>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">Your box</h2>
          <button type="button" onClick={onViewBox} className="text-xs text-white/40 hover:text-white">{box.length} Pokémon · open</button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">{recent.map((m) => <BoxMon key={m.id} mon={m} />)}</div>
      </section>

      <nav className="mt-auto flex flex-wrap items-center justify-center gap-2 pt-10 text-xs">
        {[{ label: 'Pokédex', on: onViewDex }, { label: 'Guide', on: onViewGuide }].map((l) => (
          <button key={l.label} type="button" onClick={l.on} className="rounded-full border border-white/10 bg-white/[0.02] px-4 py-1.5 font-semibold text-white/60 hover:bg-white/[0.06] hover:text-white">{l.label}</button>
        ))}
        <span className="flex items-center gap-4 px-2">
          <Credits />
          <PrivacyPolicy />
        </span>
      </nav>
    </div>
  );
}
