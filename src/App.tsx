import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { fetchMe, type AccountUser } from './game/account';
import { fetchBox, type OwnedMon } from './game/box';
import { ballCount } from './game/items';
import { fetchProfile, type Profile } from './game/profile';
import { professorById } from './game/professions';
import { partyMembers, resolveParty } from './game/party';
import { fetchRouteState, reconcileRouteState, shouldApplyHydratedBox } from './game/route-actions-client';
import type { RouteState } from './game/route-actions';
import type { MapView } from './components/world/WorldMap';
import type { WorldEntry } from './components/world/RouteScreen';
import { hashIsGuide } from './guide/hash';
import { scrollToTop } from './ui-scroll';
import { DevPanel } from './components/DevPanel';
import { LoginScreen } from './components/LoginScreen';
import { HubScreen } from './components/HubScreen';
import { TrainerBar } from './components/TrainerBar';
import { TrainerPortrait } from './components/TrainerPortrait';
import { OnboardingScreen } from './components/OnboardingScreen';
import { BoxScreen } from './components/BoxScreen';

const GuideScreen = lazy(() => import('./components/Guide').then((m) => ({ default: m.GuideScreen })));
const PokedexScreen = lazy(() => import('./components/PokedexScreen').then((m) => ({ default: m.PokedexScreen })));
const AccountScreen = lazy(() => import('./components/AccountScreen').then((m) => ({ default: m.AccountScreen })));
const PartyScreen = lazy(() => import('./components/PartyScreen').then((m) => ({ default: m.PartyScreen })));
const RouteScreen = lazy(() => import('./components/world/RouteScreen').then((m) => ({ default: m.RouteScreen })));
const BagScreen = lazy(() => import('./components/BagScreen').then((m) => ({ default: m.BagScreen })));
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

type Phase = 'hub' | 'onboarding' | 'box' | 'dex' | 'guide' | 'account' | 'trainerSprites' | 'party' | 'world' | 'bag';

export default function App() {
  const [phase, setPhase] = useState<Phase>(() => (typeof window !== 'undefined' && hashIsGuide() ? 'guide' : 'hub'));
  const [me, setMe] = useState<AccountUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [box, setBox] = useState<OwnedMon[]>([]);
  const [world, setWorld] = useState<RouteState | null>(null);
  const worldRef = useRef<RouteState | null>(null);
  // `performance.now()` when `world` arrived, to read the server's clock later without trusting the device's.
  const worldAppliedAt = useRef(0);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [mapView, setMapView] = useState<MapView | null>(null);
  // Where the world screen opens: null is its map. While it is set, the party
  // editor, box and Pokédex go back to the world there instead of to the hub.
  const [worldEntry, setWorldEntry] = useState<WorldEntry | null>(null);
  const [accountResetToken, setAccountResetToken] = useState<string | null>(null);
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const lastHydrateAt = useRef(0);

  const signOutLocally = () => {
    setMe(null);
    setBox([]);
    setProfile(null);
    setWorld(null);
    worldRef.current = null;
    setWorldError(null);
    setHydrateFailed(false);
    setProfileChecked(false);
  };

  // The session cookie ran out mid-play: back to the login screen, saying why.
  const expire = () => {
    signOutLocally();
    setPhase('hub');
    setNote('Your session expired — sign in again.');
  };

  const applyWorld = (s: RouteState, updatedBox?: OwnedMon[]) => {
    const current = worldRef.current;
    if (reconcileRouteState(current, s) !== s) return;
    worldRef.current = s;
    worldAppliedAt.current = performance.now();
    setWorld(s);
    if (updatedBox) setBox(updatedBox);
    setWorldError(null);
  };

  const refreshWorld = async () => {
    const w = await fetchRouteState();
    if (w.ok) return applyWorld(w.state);
    if (w.expired) return expire();
    setWorldError(w.error);
  };

  // Load everything a signed-in player needs: profile (null → onboarding), box, and the world.
  const hydrate = async () => {
    lastHydrateAt.current = Date.now();
    const startedAtRevision = worldRef.current?.revision ?? null;
    const [p, b, w] = await Promise.all([fetchProfile(), fetchBox(), fetchRouteState()]);
    if (p.expired || b.expired || (!w.ok && w.expired)) return expire();
    if (!p.ok || !b.ok) {
      setHydrateFailed(true);
      setProfileChecked(true);
      return;
    }
    setHydrateFailed(false);
    setProfile(p.profile);
    if (shouldApplyHydratedBox({ startedAtRevision, current: worldRef.current, incoming: w.ok ? w.state : null })) setBox(b.box);
    setProfileChecked(true);
    if (w.ok) applyWorld(w.state);
    else setWorldError(w.error);
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

  // The player may have onboarded, renamed, or played on another device:
  // refresh when the tab comes back into view (at most every 30 s).
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

  // A meter's next point lands on the server's clock. Reload the world just after it, while the trainer bar
  // shows, so the meters and the travel button move on; the client never projects a meter itself.
  useEffect(() => {
    if (!world?.activated || (phase !== 'hub' && phase !== 'world')) return;
    const pending = [world.travel.nextRefillAt, world.allowance.nextRefillAt].filter((at): at is number => at !== null);
    if (pending.length === 0) return;
    const serverClock = world.serverNow + (performance.now() - worldAppliedAt.current);
    const timer = window.setTimeout(() => void refreshWorld(), Math.max(0, Math.min(...pending) - serverClock) + 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, world]);

  const openWorld = (entry: WorldEntry | null = null) => {
    scrollToTop();
    setWorldEntry(entry);
    setPhase('world');
  };

  /** The party editor, box or Pokédex; `back` reopens the world there, otherwise they go back to the hub. */
  const openScreen = (next: 'party' | 'box' | 'dex', back: WorldEntry | null = null) => {
    scrollToTop();
    setWorldEntry(back);
    setPhase(next);
  };

  const closeScreen = () => {
    scrollToTop();
    setPhase(worldEntry ? 'world' : 'hub');
  };

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
          onDone={(b, p, displayName) => {
            setBox(b);
            setProfile(p);
            setMe((user) => user ? { ...user, displayName } : user);
            localStorage.setItem('lb-name', displayName);
            setPhase('hub');
            void refreshWorld();
          }}
        />
      );
    }
    const partyIds = profile.party.length > 0 ? profile.party : resolveParty(null, box, profile.starterId);
    const trainerBar = (
      <TrainerBar
        displayName={me.displayName || ''}
        mentorName={professorById(profile.mentor)?.name ?? 'Professor'}
        portrait={<TrainerPortrait avatarId={profile.avatarId} colors={profile.avatarColors} />}
        balls={world?.activated ? ballCount(world.inventory) : undefined}
        stamina={world?.activated ? { travel: world.travel, actions: world.allowance, serverNow: world.serverNow } : undefined}
        onOpenSettings={() => setPhase('account')}
      />
    );
    switch (phase) {
      case 'hub':
        return (
          <HubScreen
            trainerBar={trainerBar}
            box={box}
            party={partyMembers(partyIds, box)}
            world={world}
            worldError={worldError}
            location={world?.trainerAt ?? 'home'}
            onViewBox={() => openScreen('box')}
            onViewDex={() => openScreen('dex')}
            onViewGuide={() => setPhase('guide')}
            onEditParty={() => openScreen('party')}
            onOpenMap={() => openWorld()}
            onVisit={openWorld}
            onOpenBag={() => setPhase('bag')}
            onRetryWorld={() => void refreshWorld()}
          />
        );
      case 'party':
        return (
          <PartyScreen
            box={box}
            party={partyIds}
            activityRunning={Boolean(world?.activeEvent)}
            onSaved={(party) => {
              setProfile((p) => (p ? { ...p, party } : p));
              // Trip quotes come from the saved party; reload them so the travel button shows the new price.
              void refreshWorld();
            }}
            onBack={closeScreen}
            onExpired={expire}
          />
        );
      case 'world':
        return (
          <RouteScreen
            accountKey={me.id}
            trainerBar={trainerBar}
            state={world}
            error={worldError}
            box={box}
            partyIds={partyIds}
            view={mapView}
            onView={setMapView}
            entry={worldEntry ?? undefined}
            onState={applyWorld}
            onPartyChanged={(party) => setProfile((p) => (p ? { ...p, party } : p))}
            onEditParty={() => openScreen('party', { place: 'r1' })}
            onVisit={(screen, back) => openScreen(screen, back)}
            onBack={() => { scrollToTop(); setPhase('hub'); }}
            onRetry={() => void refreshWorld()}
            onExpired={expire}
          />
        );
      case 'bag':
        return (
          <BagScreen
            inventory={world?.activated ? world.inventory : null}
            error={worldError ?? (!world?.activated ? 'Visit Sunny Meadow to collect your starting supplies.' : null)}
            onBack={() => setPhase('hub')}
            onRetry={() => void refreshWorld()}
            onExplore={() => openWorld({ place: 'r1' })}
          />
        );
      case 'box':
        return (
          <BoxScreen
            box={box}
            onBack={closeScreen}
            onRenamed={(id, nickname) => setBox((b) => b.map((m) => (m.id === id ? { ...m, nickname } : m)))}
            onUpdated={(mon) => setBox((b) => b.map((m) => (m.id === mon.id ? mon : m)))}
          />
        );
      case 'dex':
        return <PokedexScreen onBack={closeScreen} me={me} />;
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
            onSignedOut={signOutLocally}
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
