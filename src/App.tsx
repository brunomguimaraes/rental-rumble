import { lazy, Suspense, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { fetchMe, type AccountUser } from './game/account';
import { fetchBox, type OwnedMon } from './game/box';
import { fetchProfile, type Profile } from './game/profile';
import { fetchCurrentSession, startIdle, claimIdle, type IdleSession, type ClaimResult } from './game/idle-client';
import type { RouteId } from './game/routes';
import { hashIsGuide } from './guide/hash';
import { DevPanel } from './components/DevPanel';
import { LoginScreen } from './components/LoginScreen';
import { HubScreen } from './components/HubScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { RouteScreen } from './components/RouteScreen';
import { ClaimScreen } from './components/ClaimScreen';
import { BoxScreen } from './components/BoxScreen';

const GuideScreen = lazy(() => import('./components/Guide').then((m) => ({ default: m.GuideScreen })));
const PokedexScreen = lazy(() => import('./components/PokedexScreen').then((m) => ({ default: m.PokedexScreen })));
const AccountScreen = lazy(() => import('./components/AccountScreen').then((m) => ({ default: m.AccountScreen })));
const TrainerSpritesScreen = import.meta.env.DEV
  ? lazy(() => import('./components/TrainerSpritesScreen').then((m) => ({ default: m.TrainerSpritesScreen })))
  : null;

function ScreenFallback() {
  return (
    <div className="grid min-h-[100dvh] place-items-center">
      <img src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`} alt="Loading" className="h-12 w-12 animate-spin object-contain [image-rendering:pixelated] opacity-70" />
    </div>
  );
}

type Phase = 'hub' | 'onboarding' | 'route' | 'claim' | 'box' | 'dex' | 'guide' | 'account' | 'trainerSprites';

export default function App() {
  const [phase, setPhase] = useState<Phase>(() => (typeof window !== 'undefined' && hashIsGuide() ? 'guide' : 'hub'));
  const [me, setMe] = useState<AccountUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [box, setBox] = useState<OwnedMon[]>([]);
  const [session, setSession] = useState<IdleSession | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [accountResetToken, setAccountResetToken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Load everything a signed-in player needs: profile (null → onboarding), box, open session.
  const hydrate = async () => {
    const [p, b, s] = await Promise.all([fetchProfile(), fetchBox(), fetchCurrentSession()]);
    setProfile(p);
    setBox(b);
    setSession(s.session);
    setServerOffsetMs(s.serverNow - Date.now());
    setProfileChecked(true);
    if (!p) setPhase('onboarding');
  };

  useEffect(() => {
    fetchMe().then((u) => {
      setMe(u);
      setAuthChecked(true);
      if (u) hydrate();
    });
    const params = new URLSearchParams(window.location.search);
    const reset = params.get('reset');
    const verified = params.get('verified');
    const oauth = params.get('oauth');
    if (reset) {
      setAccountResetToken(reset);
      setPhase('account');
    }
    if (verified) setNote(verified === '1' ? 'Email verified — thanks!' : 'That verification link was invalid or expired.');
    if (oauth) {
      const notes: Record<string, string> = {
        ok: 'Signed in — welcome!',
        error: 'Sign-in failed. Please try again.',
        email_taken: 'That email already has an account — sign in with your password first.',
        unconfigured: 'That sign-in option isn’t set up yet.',
      };
      if (notes[oauth]) setNote(notes[oauth]);
    }
    if (reset || verified || oauth) {
      params.delete('reset');
      params.delete('verified');
      params.delete('oauth');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the open session's clock honest while it is showing.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(async () => {
      const s = await fetchCurrentSession();
      setServerOffsetMs(s.serverNow - Date.now());
      setSession(s.session);
    }, 60_000);
    return () => clearInterval(t);
  }, [session]);

  const handleAuthed = (user: AccountUser) => {
    setMe(user);
    if (user.displayName) localStorage.setItem('lb-name', user.displayName);
    setAccountResetToken(null);
    setProfileChecked(false);
    hydrate();
    setPhase(hashIsGuide() ? 'guide' : 'hub');
  };

  const sendOut = async (routeId: RouteId, partyIds: string[]) => {
    if (busy) return;
    setBusy(true);
    const r = await startIdle(routeId, partyIds);
    setBusy(false);
    if (!r.ok || !r.session) {
      setNote(r.error ?? 'Could not send your trainer out.');
      return;
    }
    setSession(r.session);
  };

  const claim = async (sessionId: string) => {
    if (busy) return;
    setBusy(true);
    const r = await claimIdle(sessionId);
    setBusy(false);
    setClaimResult(r);
    if (r.box) setBox(r.box);
    if (r.ok) setSession(null);
    setPhase('claim');
  };

  const renderScreen = () => {
    if (!me) return null;
    if (!profileChecked) return <ScreenFallback />;
    if (!profile || phase === 'onboarding') {
      return (
        <OnboardingScreen
          me={me}
          onDone={(b, p) => {
            setBox(b);
            setProfile(p);
            setPhase('hub');
          }}
        />
      );
    }
    switch (phase) {
      case 'hub':
        return (
          <HubScreen
            me={me}
            box={box}
            profile={profile}
            session={session}
            serverOffsetMs={serverOffsetMs}
            onSendOut={() => setPhase('route')}
            onClaim={() => setPhase('route')}
            onViewBox={() => setPhase('box')}
            onViewDex={() => setPhase('dex')}
            onViewGuide={() => setPhase('guide')}
            onViewAccount={() => setPhase('account')}
          />
        );
      case 'route':
        return <RouteScreen box={box} session={session} serverOffsetMs={serverOffsetMs} busy={busy} onStart={sendOut} onClaim={claim} onBack={() => setPhase('hub')} />;
      case 'claim':
        if (!claimResult) return null;
        return <ClaimScreen result={claimResult} box={box} onDone={() => setPhase('hub')} onAgain={() => setPhase('route')} />;
      case 'box':
        return <BoxScreen box={box} onBack={() => setPhase('hub')} onRenamed={(id, nickname) => setBox((b) => b.map((m) => (m.id === id ? { ...m, nickname } : m)))} />;
      case 'dex':
        return <PokedexScreen onBack={() => setPhase('hub')} me={me} />;
      case 'guide':
        return <GuideScreen onBack={() => setPhase('hub')} />;
      case 'account':
        return (
          <AccountScreen
            key={`${me.id}:${accountResetToken ?? ''}`}
            me={me}
            resetToken={accountResetToken}
            onBack={() => setPhase('hub')}
            onAuthed={handleAuthed}
            onSignedOut={() => {
              setMe(null);
              setBox([]);
              setProfile(null);
              setSession(null);
            }}
          />
        );
      case 'trainerSprites':
        return TrainerSpritesScreen ? <TrainerSpritesScreen onBack={() => setPhase('hub')} /> : null;
      default:
        return null;
    }
  };

  const gated = !authChecked ? <ScreenFallback /> : !me ? <LoginScreen resetToken={accountResetToken} onAuthed={handleAuthed} /> : renderScreen();

  return (
    <>
      <Suspense fallback={<ScreenFallback />}>{gated}</Suspense>
      {note && (
        <div className="fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[90vw]">
          <button type="button" onClick={() => setNote(null)} className="rounded-full border border-white/15 bg-black/80 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-black/90">
            {note} <span className="ml-2 text-white/40">✕</span>
          </button>
        </div>
      )}
      {import.meta.env.DEV && <DevPanel onViewTrainerSprites={() => setPhase('trainerSprites')} />}
      <Analytics />
    </>
  );
}
