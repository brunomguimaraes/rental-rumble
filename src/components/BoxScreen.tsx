import { useMemo, useState } from 'react';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { setNickname, cleanNickname, NICKNAME_MAX } from '../game/profile';
import { evolutionLevel } from '../game/evolution';
import { CREATURES_BY_ID } from '../game/pokemon';
import { signLabel } from '../game/zodiac';
import { MiniSprite } from './MiniSprite';

// The box: every owned individual, newest first, with a detail drawer.

export function BoxScreen({ box, onBack, onRenamed }: { box: OwnedMon[]; onBack: () => void; onRenamed: (id: string, nickname: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = useMemo(() => box.find((m) => m.id === openId) ?? null, [box, openId]);
  const creature = useMemo(() => (open ? ownedMonToCreature(open) : null), [open]);

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
            <button key={m.id} type="button" onClick={() => { setOpenId(m.id); setNick(''); setError(null); }} className={`flex flex-col items-center gap-1 rounded-2xl border p-2 ${m.id === openId ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <MiniSprite creature={c} className="h-9 w-9" />
              <span className="w-full truncate text-[10px] text-white/70">{c.name}</span>
              <span className="text-[10px] font-bold text-white/50">Lv {m.level}</span>
            </button>
          );
        })}
      </div>

      {open && creature && (
        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-4">
            <img src={creature.portrait} alt={creature.name} className="h-20 w-20 rounded-2xl object-contain [image-rendering:pixelated]" />
            <div>
              <div className="text-lg font-black text-white">{creature.name}</div>
              <div className="text-xs text-white/50">{CREATURES_BY_ID[String(open.dexId)].name} · Lv {open.level} · {signLabel(open.sign)}{open.shiny ? ' · Shiny' : ''}</div>
              <div className="text-xs text-white/50">{open.origin === 'starter' ? 'Your starter' : open.origin === 'tutorial' ? 'First catch' : 'Caught'}</div>
              {(() => { const at = evolutionLevel(open.dexId, open.origin); return at ? <div className="text-xs text-emerald-300/80">Evolves at Lv {at}</div> : null; })()}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            {(['hp', 'atk', 'eatk', 'def', 'edef', 'spd'] as const).map((k) => (
              <div key={k} className="rounded-xl bg-white/[0.04] py-1.5"><div className="text-white/40 uppercase">{k}</div><div className="font-bold text-white">{creature.stats[k]}</div></div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={NICKNAME_MAX} placeholder="Nickname" className="flex-1 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none focus:border-emerald-400/60" />
            <button type="button" disabled={busy} onClick={save} className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black disabled:opacity-60">{busy ? '…' : 'Save'}</button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
        </section>
      )}
    </div>
  );
}
