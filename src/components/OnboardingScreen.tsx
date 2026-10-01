import { useMemo, useState } from 'react';
import type { AccountUser } from '../game/account';
import { PROFESSORS, professorArtUrl, starterLine, starterOffer } from '../game/professions';
import { onboard, setNickname, cleanNickname, NICKNAME_MAX, type Profile } from '../game/profile';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { CREATURES_BY_ID } from '../game/pokemon';
import { signLabel } from '../game/zodiac';
import { PixelSprite } from './ui/PixelSprite';
import { TrainerIdentityPicker } from './TrainerIdentityPicker';
import type { TrainerIdentity } from '../game/trainer-identity';
import { scrollToTop } from '../ui-scroll';

// First minute: trainer identity → Professor Andre offers three weak, three-stage lines
// (fixed per account) → starter reveal + optional nickname → hub. The server
// re-derives the offer, checks the pick and mints the starter with the profile.

type Step = 'identity' | 'pick' | 'starter';

const PROFESSOR = PROFESSORS[0];

export function OnboardingScreen({
  me,
  onDone,
}: {
  me: AccountUser;
  onDone: (box: OwnedMon[], profile: Profile, displayName: string) => void;
}) {
  const [step, setStep] = useState<Step>('identity');
  const [identity, setIdentity] = useState<TrainerIdentity | null>(null);
  const [savedName, setSavedName] = useState(me.displayName);
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
    if (!identity || busy) return;
    setBusy(true);
    setError(null);
    const r = await onboard({ starter: dexId, ...identity });
    setBusy(false);
    if (!r.ok || !r.profile || !r.starter) {
      setError(r.error ?? 'Could not start your journey.');
      return;
    }
    setProfile(r.profile);
    setSavedName(r.displayName ?? identity.displayName);
    setStarter(r.starter);
    setBox(r.box ?? [r.starter]);
    setStep('starter');
    scrollToTop();
  };

  const confirmStarter = async () => {
    if (!starter || !profile || busy) return;
    setError(null);
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
    onDone(finalBox, profile, savedName);
  };

  return (
    <div className={`mx-auto flex min-h-[100dvh] max-w-2xl flex-col font-pixel text-ink ${step === 'identity' ? 'px-4 py-5 sm:px-6 sm:py-8' : 'px-5 py-8'}`}>
      {step === 'identity' && (
        <TrainerIdentityPicker initialName={me.displayName} initialIdentity={identity} onContinue={(choice) => {
          setIdentity(choice);
          setStep('pick');
          scrollToTop();
        }} />
      )}
      {step === 'pick' && (
        <button type="button" disabled={busy} onClick={() => { setError(null); setStep('identity'); scrollToTop(); }}
          className="ui-button ui-focus mb-6 min-h-11 self-start px-3 font-label text-[9px] uppercase">
          ← Edit trainer
        </button>
      )}
      {step === 'pick' && (
        <>
          <header>
            <p className="font-label text-[10px] uppercase text-info">02 / 03 · Your partner</p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Choose your first partner.</h1>
            <p className="mt-2 text-base text-ink-dim">Every great team starts with a little Pokémon.</p>
          </header>
          <div className="ui-window mt-8 flex flex-col items-center gap-3 p-4 sm:flex-row">
            <PixelSprite src={professorArtUrl(PROFESSOR)} alt="" size={96} className="sm:h-48 sm:w-48" />
            <div>
              <h2 className="text-xl font-bold text-ink">{PROFESSOR.name}</h2>
              <p className="mt-2 text-base leading-snug text-ink-dim">{PROFESSOR.blurb}</p>
            </div>
          </div>
          <p role="status" className="mt-6 min-h-5 text-sm text-info">{busy ? 'Preparing your partner…' : 'Choose one Pokémon to begin your journey.'}</p>
          {error && <p role="alert" className="mt-3 border-2 border-accent bg-slot p-3 text-base text-ink">{error}</p>}
          <div aria-label="Starter choices" aria-busy={busy} className="mt-4 grid gap-4">
            {offer.map(({ id, line }) => {
              const base = line[0];
              if (!base) return null;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(id)}
                  className="ui-button ui-focus flex items-center gap-3 border-2 border-edge p-3 text-left hover:border-accent focus-visible:border-accent disabled:opacity-75 sm:gap-4"
                >
                  <span className="shrink-0 border-2 border-window-frame bg-slot p-1">
                    <PixelSprite src={base.portrait} alt="" size={80} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-xl font-bold text-ink">{base.name}</span>
                    <span className="mt-1 block font-label text-[9px] uppercase text-info">{base.types.join(' / ')}</span>
                    <span className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm leading-snug text-ink-dim">
                      {line.map((c, i) => (
                        <span key={c.dexId}>
                          {i > 0 && <span aria-hidden="true">→ </span>}
                          {c.name}
                        </span>
                      ))}
                    </span>
                    <span className="mt-3 block font-label text-[9px] uppercase text-accent"><span aria-hidden="true">▶ </span>Choose partner</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-5 text-sm text-ink-dim">All three start weak. You’ll grow stronger together.</p>
        </>
      )}

      {step === 'starter' && starter && starterCreature && (
        <div className="flex flex-1 flex-col justify-center gap-8">
          <header>
            <p className="font-label text-[10px] uppercase text-info">03 / 03 · Your journey begins</p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Meet {CREATURES_BY_ID[String(starter.dexId)].name}.</h1>
            <p className="mt-2 text-base text-ink-dim">{PROFESSOR.name} hands you your first partner.</p>
          </header>
          <form onSubmit={(event) => { event.preventDefault(); void confirmStarter(); }} aria-busy={busy}
            className="ui-window flex flex-col items-center p-5 text-center">
            <div className="border-2 border-window-frame bg-slot p-2">
              <PixelSprite src={starterCreature.portrait} alt={starterCreature.name} size={120} />
            </div>
            <p className="mt-4 text-xl font-bold text-ink">{CREATURES_BY_ID[String(starter.dexId)].name}</p>
            <p className="mt-1 text-base text-ink-dim">Born under {signLabel(starter.sign)}</p>
            <div className="mt-6 w-full border-t-2 border-window-frame pt-5 text-left">
              <label htmlFor="starter-nickname" className="font-label text-[10px] uppercase text-info">Give them a nickname</label>
              <input id="starter-nickname" name="nickname" value={nick} disabled={busy}
                onChange={(e) => { setNick(e.target.value); setError(null); }} maxLength={NICKNAME_MAX}
                placeholder={CREATURES_BY_ID[String(starter.dexId)].name}
                aria-describedby={error ? 'nickname-help nickname-error' : 'nickname-help'}
                className="ui-focus mt-2 block min-h-12 w-full rounded-sm border-2 border-edge bg-slot px-3 text-xl text-ink placeholder:text-ink-dim" />
              <p id="nickname-help" className="mt-2 text-sm text-ink-dim">Optional · Up to {NICKNAME_MAX} characters. Leave blank to keep their species name.</p>
              {error && <p id="nickname-error" role="alert" className="mt-3 border-2 border-accent bg-slot p-3 text-base text-ink">{error}</p>}
            </div>
            <button type="submit" disabled={busy} className="ui-button-primary ui-focus mt-6 min-h-12 w-full px-4 font-label text-[11px] uppercase disabled:opacity-75">
              {busy ? 'Saving nickname…' : 'To the hub →'}
            </button>
            <p role="status" className="sr-only">{busy ? 'Saving your partner’s nickname.' : ''}</p>
          </form>
        </div>
      )}
    </div>
  );
}
