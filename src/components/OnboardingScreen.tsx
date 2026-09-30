import { useMemo, useState } from 'react';
import type { AccountUser } from '../game/account';
import { PROFESSIONS, PROFESSORS, professorArtUrl, starterLine, type Professor } from '../game/professions';
import { onboard, setNickname, cleanNickname, type Profile } from '../game/profile';
import { tutorialCatch } from '../game/idle-client';
import { ownedMonToCreature, type OwnedMon } from '../game/box';
import { CREATURES_BY_ID } from '../game/pokemon';
import { scaleCreatureToLevel } from '../game/levels';
import { simulateBattle } from '../game/battle';
import type { Creature, Opponent } from '../game/types';
import { MiniSprite } from './MiniSprite';
import { BattleScreen } from './BattleScreen';

// First five minutes: profession → professor → starter reveal + nickname →
// tutorial battle (outcome doesn't matter) → guided first catch. The server
// mints the starter and the gift; this screen only walks the story.

type Step = 'profession' | 'professor' | 'starter' | 'battle' | 'catch' | 'done';

const TUTORIAL_WILDS = [19, 16, 161, 263, 399]; // Rattata, Pidgey, Sentret, Zigzagoon, Bidoof

function wildOpponent(name: string, title: string, type: Creature['types'][number]): Opponent {
  return { id: `wild-${name}`, name, title, sprite: '🌿', badge: '', art: '', artGif: '', type, teamSize: 1, tier: 'trainer', quote: '' };
}

export function OnboardingScreen({
  me,
  onDone,
}: {
  me: AccountUser;
  onDone: (box: OwnedMon[], profile: Profile) => void;
}) {
  const [step, setStep] = useState<Step>('profession');
  const [professor, setProfessor] = useState<Professor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [starter, setStarter] = useState<OwnedMon | null>(null);
  const [box, setBox] = useState<OwnedMon[]>([]);
  const [nick, setNick] = useState('');
  const [caught, setCaught] = useState<OwnedMon | null>(null);

  const starterCreature = useMemo(() => (starter ? ownedMonToCreature(starter) : null), [starter]);

  const tutorialBattle = useMemo(() => {
    if (!starterCreature) return null;
    const seed = `tutorial:${me.id}`;
    const pick = TUTORIAL_WILDS[Math.abs(hash(seed)) % TUTORIAL_WILDS.length];
    const wild = scaleCreatureToLevel(CREATURES_BY_ID[String(pick)], 3);
    return { wild, result: simulateBattle([starterCreature], [wild], seed, {}) };
  }, [starterCreature, me.id]);

  const chooseProfessor = async (p: Professor) => {
    setBusy(true);
    setError(null);
    const r = await onboard(p.id);
    setBusy(false);
    if (!r.ok || !r.profile || !r.starter) {
      setError(r.error ?? 'Could not start your journey.');
      return;
    }
    setProfessor(p);
    setProfile(r.profile);
    setStarter(r.starter);
    setBox(r.box ?? [r.starter]);
    setStep('starter');
  };

  const confirmStarter = async () => {
    if (!starter) return;
    const clean = cleanNickname(nick);
    if (nick.trim() && !clean) {
      setError('Nicknames are 1–12 characters.');
      return;
    }
    if (clean) {
      setBusy(true);
      const r = await setNickname(starter.id, clean);
      setBusy(false);
      if (!r.ok) {
        setError(r.error ?? 'Could not save that name.');
        return;
      }
      const named = { ...starter, nickname: clean };
      setStarter(named);
      setBox((b) => b.map((m) => (m.id === named.id ? named : m)));
    }
    setError(null);
    setStep('battle');
  };

  const doCatch = async () => {
    setBusy(true);
    const r = await tutorialCatch();
    setBusy(false);
    if (!r.ok || !r.caught) {
      setError(r.error ?? 'The catch slipped away — try again.');
      return;
    }
    setCaught(r.caught);
    setBox(r.box ?? []);
    setStep('done');
  };

  if (step === 'battle' && tutorialBattle && starterCreature) {
    return (
      <BattleScreen
        opponent={wildOpponent('Wild ' + tutorialBattle.wild.name, 'Route 1 · Your first battle', tutorialBattle.wild.types[0])}
        playerTeam={[starterCreature]}
        foeTeam={[tutorialBattle.wild]}
        result={tutorialBattle.result}
        onComplete={() => setStep('catch')}
      />
    );
  }

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
                onClick={() => setStep('professor')}
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

      {step === 'professor' && (
        <>
          <h1 className="text-2xl font-black text-white">Choose your professor</h1>
          <p className="mt-2 text-sm text-white/60">Each one hands you a different partner. They all start weak. That’s the point.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROFESSORS.map((p) => {
              const line = starterLine(p).map((id) => CREATURES_BY_ID[String(id)]).filter(Boolean);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => chooseProfessor(p)}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition hover:bg-white/[0.08] disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <img src={professorArtUrl(p)} alt="" className="h-12 w-12 object-contain [image-rendering:pixelated]" />
                    <div>
                      <div className="font-black text-white">{p.name}</div>
                      <div className="text-xs text-white/50">{p.bias}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-white/60">{p.blurb}</div>
                  <div className="mt-3 flex items-center gap-2">
                    {line.map((c, i) => (
                      <span key={c.dexId} className="flex items-center gap-1 text-[10px] text-white/60">
                        {i > 0 && <span className="text-white/30">→</span>}
                        <MiniSprite creature={c} className="h-6 w-6" />
                        {c.name}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        </>
      )}

      {step === 'starter' && starter && starterCreature && professor && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">{professor.name} hands you…</div>
          <img src={starterCreature.portrait} alt={starterCreature.name} className="mt-4 h-40 w-40 rounded-3xl border border-white/10 bg-white/[0.03] object-contain [image-rendering:pixelated]" />
          <h1 className="mt-4 text-2xl font-black text-white">{CREATURES_BY_ID[String(starter.dexId)].name}</h1>
          <div className="mt-1 text-sm text-white/60">Lv {starter.level} · born under {starter.sign}</div>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            maxLength={12}
            placeholder="Give it a nickname (optional)"
            className="mt-6 w-full max-w-xs rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-center text-sm text-white outline-none focus:border-emerald-400/60"
          />
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <button type="button" disabled={busy} onClick={confirmStarter} className="mt-6 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:opacity-60">
            {busy ? '…' : 'Let’s go'}
          </button>
        </div>
      )}

      {step === 'catch' && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="text-5xl">🌿</span>
          <h1 className="mt-4 text-2xl font-black text-white">Something rustles in the grass</h1>
          <p className="mt-2 max-w-sm text-white/60">
            {tutorialBattle?.result.winner === 'player' ? 'That was a win. ' : 'Your partner needs training, but that’s what the road is for. '}
            Throw your first ball — this one always sticks.
          </p>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <button type="button" disabled={busy} onClick={doCatch} className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:opacity-60">
            {busy ? '…' : 'Throw a Poké Ball'}
          </button>
        </div>
      )}

      {step === 'done' && caught && profile && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">Gotcha!</div>
          <h1 className="mt-2 text-2xl font-black text-white">{CREATURES_BY_ID[String(caught.dexId)].name} joined you</h1>
          <p className="mt-2 max-w-sm text-white/60">
            Your trainer will keep walking Route 1 and battling while you’re away, for up to 8 hours. Come back to see what happened.
          </p>
          <button type="button" onClick={() => onDone(box, profile)} className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95">
            To the hub
          </button>
        </div>
      )}
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
