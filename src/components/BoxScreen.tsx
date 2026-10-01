import { useMemo, useState } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { setNickname, cleanNickname, NICKNAME_MAX } from '../game/profile';
import { evolutionLevel } from '../game/evolution';
import { STAT_KEYS, STAT_LABELS, evolutionLines, growthLines, speciesGrowth } from '../game/growth';
import { DEV, devGrowOnce } from '../game/dev';
import { CREATURES_BY_ID } from '../game/pokemon';
import { signLabel } from '../game/zodiac';
import { MiniSprite } from './MiniSprite';
import { ExpBar } from './ui/ExpBar';
import { GrowthStats } from './GrowthStats';

// The box: every owned individual, newest first, with a detail drawer. No level
// is printed anywhere here: the EXP bar and the six stat bars carry growth.

/** "Close to evolving" from this many hidden levels out; nothing before. */
const EVOLUTION_HINT_LEVELS = 3;

function closeToEvolving(mon: OwnedMon): boolean {
  const at = evolutionLevel(mon.dexId, mon.origin);
  return at !== null && mon.level >= at - EVOLUTION_HINT_LEVELS;
}

function originLabel(mon: OwnedMon): string {
  return mon.origin === 'starter' ? 'Your starter' : mon.origin === 'tutorial' ? 'First catch' : 'Caught';
}

/** Dev-only readout of what the player never sees: the hidden level, exact potential and ceilings, and a Grow once button. */
function DevGrowth({ mon, busy, onGrow }: { mon: OwnedMon; busy: boolean; onGrow: () => void }) {
  const g = speciesGrowth(mon.dexId, mon.build);
  return (
    <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-[11px] text-amber-100/80">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold uppercase tracking-widest text-amber-200/70">Dev · hidden level {mon.level} · EXP {mon.exp}</span>
        <button type="button" disabled={busy} onClick={onGrow} className="rounded-full border border-amber-300/40 px-3 py-1 font-semibold text-amber-200 disabled:opacity-60">
          {busy ? '…' : 'Grow once'}
        </button>
      </div>
      {g && (
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-amber-200/50"><th>Stat</th><th>Now</th><th>Potential</th><th>Ceiling</th></tr>
          </thead>
          <tbody>
            {STAT_KEYS.map((k) => (
              <tr key={k}><td>{STAT_LABELS[k].short}</td><td>{mon.stats[k]}</td><td>{g.potential[k]}%</td><td>{g.ceiling[k]}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function BoxScreen({ box, onBack, onRenamed, onUpdated }: {
  box: OwnedMon[];
  onBack: () => void;
  onRenamed: (id: string, nickname: string) => void;
  onUpdated: (mon: OwnedMon) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [growing, setGrowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGrowth, setLastGrowth] = useState<string[]>([]);
  const open = useMemo(() => box.find((m) => m.id === openId) ?? null, [box, openId]);
  const creature = useMemo(() => (open ? ownedMonToCreature(open) : null), [open]);

  const select = (id: string) => {
    setOpenId(id);
    setNick('');
    setError(null);
    setLastGrowth([]);
  };

  const save = async () => {
    if (!open) return;
    const clean = cleanNickname(nick);
    if (!clean) {
      setError(`Nicknames are 1–${NICKNAME_MAX} characters.`);
      return;
    }
    setBusy(true);
    const r = await setNickname(open.id, clean);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'Could not save.');
    setError(null);
    setNick('');
    onRenamed(open.id, clean);
  };

  const grow = async () => {
    if (!open || !creature) return;
    setGrowing(true);
    const r = await devGrowOnce(open.id);
    setGrowing(false);
    if (!r.ok || !r.mon) return setError(r.error ?? 'Could not grow.');
    const lines: string[] = [];
    for (const e of r.growths ?? []) lines.push(...growthLines(creature.name, e));
    for (const ev of r.evolutions ?? []) lines.push(...evolutionLines(creature.name, CREATURES_BY_ID[String(ev.toDexId)].name, ev.deltas));
    setLastGrowth(lines);
    setError(null);
    onUpdated(r.mon);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-black text-white">Box <span className="text-sm font-semibold text-white/40">{box.length}</span></h1>
        <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white">Back</button>
      </header>

      <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {box.map((m) => {
          const c = ownedMonToCreature(m);
          if (!c) return null;
          return (
            <button key={m.id} type="button" onClick={() => select(m.id)} className={`flex flex-col items-center gap-1 rounded-2xl border p-2 ${m.id === openId ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <MiniSprite creature={c} className="h-9 w-9" />
              <span className="w-full truncate text-[10px] text-white/70">{c.name}</span>
              <ExpBar level={m.level} exp={m.exp} />
            </button>
          );
        })}
      </div>

      {open && creature && (
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-4">
            <img src={creature.portrait} alt={creature.name} className="h-20 w-20 rounded-2xl object-contain [image-rendering:pixelated]" />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-black text-white">{creature.name}</div>
              <div className="text-xs text-white/50">{CREATURES_BY_ID[String(open.dexId)].name} · {signLabel(open.sign)}{open.shiny ? ' · Shiny' : ''}</div>
              <div className="text-xs text-white/50">{originLabel(open)}</div>
              {closeToEvolving(open) && <div className="text-xs text-emerald-300/80">Close to evolving</div>}
              <div className="mt-2"><ExpBar level={open.level} exp={open.exp} showPercent /></div>
            </div>
          </div>
          <GrowthStats mon={open} />
          {lastGrowth.length > 0 && (
            <ul className="mt-4 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/80" aria-live="polite">
              {lastGrowth.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={NICKNAME_MAX} placeholder="Nickname" className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
            <button type="button" disabled={busy} onClick={save} className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black disabled:opacity-60">{busy ? '…' : 'Save'}</button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
          {DEV && <DevGrowth mon={open} busy={growing} onGrow={grow} />}
        </section>
      )}
    </div>
  );
}
