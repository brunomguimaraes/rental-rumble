import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { fetchMe, type AccountUser } from './game/account';
import { fetchBox, type OwnedMon } from './game/box';
import { fetchProfile, type Profile } from './game/profile';
import { hashIsGuide } from './guide/hash';
import { DevPanel } from './components/DevPanel';
import { LoginScreen } from './components/LoginScreen';
import { HubScreen } from './components/HubScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
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

type Phase = 'hub' | 'onboarding' | 'box' | 'dex' | 'guide' | 'account' | 'trainerSprites';

export default function App() {
  const [phase, setPhase] = useState<Phase>(() => (typeof window !== 'undefined' && hashIsGuide() ? 'guide' : 'hub'));
  const [me, setMe] = useState<AccountUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [box, setBox] = useState<OwnedMon[]>([]);
  const [accountResetToken, setAccountResetToken] = useState<string | null>(null);
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const lastHydrateAt = useRef(0);

  // Load everything a signed-in player needs: profile (null → onboarding) and box.
  const hydrate = async () => {
    lastHydrateAt.current = Date.now();
    const [p, b] = await Promise.all([fetchProfile(), fetchBox()]);
    if (!p.ok) {
      setHydrateFailed(true);
      setProfileChecked(true);
      return;
    }
    setHydrateFailed(false);
    setProfile(p.profile);
    setBox(b);
    setProfileChecked(true);
    if (!p.profile) setPhase('onboarding');
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

  // The player may have onboarded or renamed on another device: refresh when
  // the tab comes back into view (at most every 30 s).
  useEffect(() => {
    if (!me) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastHydrateAt.current < 30_000) return;
      hydrate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const handleAuthed = (user: AccountUser) => {
    setMe(user);
    if (user.displayName) localStorage.setItem('lb-name', user.displayName);
    setAccountResetToken(null);
    setProfileChecked(false);
    hydrate();
    setPhase(hashIsGuide() ? 'guide' : 'hub');
  };

  const renderScreen = () => {
    if (!me) return null;
    if (hydrateFailed) {
      return (
        <div className="grid min-h-[100dvh] place-items-center px-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-white/70">Couldn’t load your trainer.</p>
            <button type="button" onClick={() => { setHydrateFailed(false); setProfileChecked(false); hydrate(); }} className="rounded-full border border-white/20 px-6 py-2 text-sm font-bold hover:bg-white/10">Retry</button>
          </div>
        </div>
      );
    }
    if (!profileChecked) return <ScreenFallback />;
    // Stay on onboarding until it calls onDone: a background refresh can load
    // the just-minted profile while the player is still naming the starter.
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
            onViewBox={() => setPhase('box')}
            onViewDex={() => setPhase('dex')}
            onViewGuide={() => setPhase('guide')}
            onViewAccount={() => setPhase('account')}
          />
        );
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
              setHydrateFailed(false);
              setProfileChecked(false);
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
