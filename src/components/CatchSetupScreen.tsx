import { useMemo, useState } from 'react';
import {
  BATTLE_ZONES,
  isLevelInZone,
  isPartyEligible,
  zoneById,
  type CatchZone,
} from '../game/zones';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { MiniSprite } from './MiniSprite';

// Pick a level zone, then pick a legal 1-6 party of owned mons from the box. A
// brand-new player (empty box) is routed straight to the one-time tutorial
// catch, which needs no party.

function PartyMon({
  mon,
  selected,
  eligible,
  onToggle,
}: {
  mon: OwnedMon;
  selected: boolean;
  eligible: boolean;
  onToggle: () => void;
}) {
  const creature = useMemo(() => ownedMonToCreature(mon), [mon]);
  if (!creature) return null;
  return (
    <button
      type="button"
      disabled={!eligible}
      onClick={onToggle}
      aria-pressed={selected}
      className={`flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-2xl border px-1.5 py-2 transition ${
        selected
          ? 'border-emerald-400/70 bg-emerald-400/10'
          : eligible
            ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
            : 'border-white/5 bg-white/[0.01] opacity-40'
      }`}
    >
      <MiniSprite creature={creature} className="h-9 w-9" />
      <span className="w-full truncate text-center text-[10px] text-white/70" title={creature.name}>
        {creature.name}
      </span>
      <span className="text-[10px] font-bold text-white/50">Lv {mon.level}</span>
    </button>
  );
}

export function CatchSetupScreen({
  box,
  onStart,
  onBack,
  busy = false,
}: {
  box: OwnedMon[];
  onStart: (zone: CatchZone, partyIds: string[]) => void;
  onBack: () => void;
  busy?: boolean;
}) {
  const isNewPlayer = box.length === 0;
  const tutorial = zoneById('tutorial')!;
  const [zoneId, setZoneId] = useState<string>(BATTLE_ZONES[0].id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const zone = zoneById(zoneId) ?? BATTLE_ZONES[0];

  const eligibleMons = useMemo(
    () => box.filter((m) => isLevelInZone(m.level, zone)),
    [box, zone],
  );

  const partyIds = [...selected];
  const partyLevels = box.filter((m) => selected.has(m.id)).map((m) => m.level);
  const canStart = !busy && isPartyEligible(partyLevels, zone);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 6) next.add(id);
      return next;
    });
  };

  const pickZone = (z: CatchZone) => {
    setZoneId(z.id);
    // Drop any now-ineligible picks when the band changes.
    setSelected((prev) => {
      const next = new Set<string>();
      for (const m of box) {
        if (prev.has(m.id) && isLevelInZone(m.level, z)) next.add(m.id);
      }
      return next;
    });
  };

  if (isNewPlayer) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10 text-center">
        <span className="text-5xl">🌿</span>
        <h1 className="mt-4 text-2xl font-black text-white">{tutorial.name}</h1>
        <p className="mt-2 max-w-sm text-white/60">{tutorial.blurb}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => onStart(tutorial, [])}
          className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:opacity-60"
        >
          {busy ? '…' : 'Catch your first partner'}
        </button>
        <button type="button" onClick={onBack} className="mt-4 text-sm text-white/50 hover:text-white">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Catch Run</h1>
        <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white">
          Back
        </button>
      </header>

      {/* Zone picker */}
      <section className="mt-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-white/40">
          Choose a zone
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {BATTLE_ZONES.map((z) => {
            const active = z.id === zoneId;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => pickZone(z)}
                aria-pressed={active}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-emerald-400/70 bg-emerald-400/10'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-white">{z.name}</span>
                  <span className="text-xs font-semibold text-white/50">
                    Lv {z.min}-{z.max}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/50">{z.blurb}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Party picker */}
      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-xs font-bold uppercase tracking-widest text-white/40">
            Your party ({partyIds.length}/6)
          </div>
          <div className="text-xs text-white/40">
            {zone.name} · Lv {zone.min}-{zone.max}
          </div>
        </div>
        {eligibleMons.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/50">
            No owned Pokémon fall in this zone’s level band yet. Try a lower zone,
            or raise a mon first.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {box.map((m) => (
              <PartyMon
                key={m.id}
                mon={m}
                selected={selected.has(m.id)}
                eligible={isLevelInZone(m.level, zone)}
                onToggle={() => toggle(m.id)}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-auto pt-8">
        <button
          type="button"
          disabled={!canStart}
          onClick={() => onStart(zone, partyIds)}
          className="w-full rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy
            ? '…'
            : partyIds.length === 0
              ? 'Pick at least one Pokémon'
              : `Enter ${zone.name}`}
        </button>
      </div>
    </div>
  );
}
