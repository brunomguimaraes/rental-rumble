import { useMemo, useState } from 'react';
import type { AccountUser } from '../game/account';
import { PROFESSIONS, PROFESSORS, professorArtUrl, starterLine, starterOffer } from '../game/professions';
import { onboard, setNickname, cleanNickname, type Profile } from '../game/profile';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { CREATURES_BY_ID } from '../game/pokemon';
import { signLabel } from '../game/zodiac';
import { MiniSprite } from './MiniSprite';
import { PixelSprite } from './ui/PixelSprite';

// First minute: profession → Professor Andre offers three weak, three-stage lines
// (fixed per account) → starter reveal + optional nickname → hub. The server
// re-derives the offer, checks the pick and mints the starter with the profile.

type Step = 'profession' | 'pick' | 'starter';

const PROFESSOR = PROFESSORS[0];

export function OnboardingScreen({
  me,
  onDone,
}: {
  me: AccountUser;
  onDone: (box: OwnedMon[], profile: Profile) => void;
}) {
  const [step, setStep] = useState<Step>('profession');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [starter, setStarter] = useState<OwnedMon | null>(null);
  const [box, setBox] = useState<OwnedMon[]>([]);
  const [nick, setNick] = useState('');

  const offer = useMemo(
    () => starterOffer(`offer:${me.id}`).map((id) => ({ id, line: starterLine(id).map((d) => CREATURES_BY_ID[String(d)]).filter(Boolean) })),
    [me.id],
  );
  const starterCreature = useMemo(() => (starter ? ownedMonToCreature(starter) : null), [starter]);

  const pick = async (dexId: number) => {
    setBusy(true);
    setError(null);
    const r = await onboard(dexId);
    setBusy(false);
    if (!r.ok || !r.profile || !r.starter) {
      setError(r.error ?? 'Could not start your journey.');
      return;
    }
    setProfile(r.profile);
    setStarter(r.starter);
    setBox(r.box ?? [r.starter]);
    setStep('starter');
  };

  const confirmStarter = async () => {
    if (!starter || !profile) return;
    const clean = cleanNickname(nick);
    if (nick.trim() && !clean) {
      setError('Nicknames are 1–12 characters.');
      return;
    }
    let finalBox = box;
    if (clean) {
      setBusy(true);
      const r = await setNickname(starter.id, clean);
      setBusy(false);
      if (!r.ok) {
        setError(r.error ?? 'Could not save that name.');
        return;
      }
      finalBox = box.map((m) => (m.id === starter.id ? { ...m, nickname: clean } : m));
    }
    onDone(finalBox, profile);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-5 py-8">
      {step === 'profession' && (
        <>
          <h1 className="text-2xl font-black text-white">Who are you, {me.displayName || 'friend'}?</h1>
          <p className="mt-2 text-sm text-white/60">Pick a profession. Only the Trainer road is open for now.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROFESSIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={p.locked}
                onClick={() => setStep('pick')}
                className={`rounded-3xl border px-5 py-4 text-left transition ${
                  p.locked ? 'cursor-not-allowed border-white/5 bg-white/[0.01] opacity-50' : 'border-emerald-400/60 bg-emerald-400/10 hover:bg-emerald-400/20'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-black text-white">{p.name}</span>
                  {p.locked && <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Locked</span>}
                </div>
                <div className="mt-1 text-xs text-white/60">{p.blurb}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'pick' && (
        <>
          <div className="ui-window m-2 flex flex-col items-center gap-3 p-4 sm:flex-row">
            <PixelSprite src={professorArtUrl(PROFESSOR)} alt="" size={192} />
            <div>
              <h1 className="font-pixel text-2xl font-bold text-ink">{PROFESSOR.name}</h1>
              <p className="mt-2 font-pixel text-base text-ink-dim">{PROFESSOR.blurb}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            {offer.map(({ id, line }) => {
              const base = line[0];
              if (!base) return null;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(id)}
                  className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.08] disabled:opacity-60"
                >
                  <img src={base.portrait} alt="" className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 object-contain [image-rendering:pixelated]" />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-black text-white">{base.name}</span>
                      <span className="text-xs text-white/50">{base.types.join(' / ')}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {line.map((c, i) => (
                        <span key={c.dexId} className="flex items-center gap-1 text-[11px] text-white/60">
                          {i > 0 && <span className="text-white/30">→</span>}
                          <MiniSprite creature={c} className="h-6 w-6" />
                          {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-white/40">All three start weak. That’s the point.</p>
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </>
      )}

      {step === 'starter' && starter && starterCreature && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">{PROFESSOR.name} hands you…</div>
          <img src={starterCreature.portrait} alt={starterCreature.name} className="mt-4 h-40 w-40 rounded-3xl border border-white/10 bg-white/[0.03] object-contain [image-rendering:pixelated]" />
          <h1 className="mt-4 text-2xl font-black text-white">{CREATURES_BY_ID[String(starter.dexId)].name}</h1>
          <div className="mt-1 text-sm text-white/60">Born under {signLabel(starter.sign)}</div>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={12}
            placeholder="Give it a nickname (optional)"
            className="mt-6 w-full max-w-xs rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-center text-sm text-white outline-none focus:border-emerald-400/60"
          />
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <button type="button" disabled={busy} onClick={confirmStarter} className="mt-6 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:opacity-60">
            {busy ? '…' : 'To the hub'}
          </button>
        </div>
      )}
    </div>
  );
}
