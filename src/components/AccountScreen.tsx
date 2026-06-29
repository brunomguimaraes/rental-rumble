import { useState } from 'react';
import {
  signup,
  login,
  logout,
  requestReset,
  resetPassword,
  oauthUrl,
  type AccountUser,
} from '../game/account';

// The optional account hub: sign in, create an account, recover a password, or
// (when signed in) view your profile + lifetime stats and sign out. Everything
// here is opt-in — the rest of the game never requires reaching this screen.

type Mode = 'menu' | 'signin' | 'signup' | 'forgot' | 'reset';

const INPUT =
  'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none';
const PRIMARY =
  'w-full rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60';
const LINK = 'text-white/60 underline-offset-2 hover:text-white hover:underline';

export function AccountScreen({
  me,
  resetToken,
  onBack,
  onAuthed,
  onSignedOut,
  onViewMyRuns,
}: {
  me: AccountUser | null;
  resetToken?: string | null;
  onBack: () => void;
  onAuthed: (user: AccountUser) => void;
  onSignedOut: () => void;
  onViewMyRuns?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(
    resetToken ? 'reset' : me ? 'menu' : 'signin',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Pre-seed the display name from the anonymous board name so a returning
  // player keeps their identity on first sign-up (the lb-name migration).
  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('lb-name') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const clear = () => {
    setError(null);
    setInfo(null);
  };
  const go = (next: Mode) => {
    clear();
    setMode(next);
  };

  const handleSignup = async () => {
    clear();
    setBusy(true);
    const r = await signup({ email, password, displayName });
    setBusy(false);
    if (r.ok && r.user) onAuthed(r.user);
    else setError(r.error ?? 'could not create account');
  };

  const handleLogin = async () => {
    clear();
    setBusy(true);
    const r = await login({ email, password });
    setBusy(false);
    if (r.ok && r.user) onAuthed(r.user);
    else setError(r.error ?? 'could not sign in');
  };

  const handleForgot = async () => {
    clear();
    setBusy(true);
    await requestReset(email);
    setBusy(false);
    setInfo(
      'If that email has an account, a reset link is on its way. Check your inbox.',
    );
  };

  const handleReset = async () => {
    clear();
    if (!resetToken) return;
    setBusy(true);
    const r = await resetPassword(resetToken, password);
    setBusy(false);
    if (r.ok && r.user) onAuthed(r.user);
    else setError(r.error ?? 'could not reset your password');
  };

  const handleLogout = async () => {
    setBusy(true);
    await logout();
    setBusy(false);
    onSignedOut();
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center px-4 py-10 text-center sm:px-6">
      <img
        src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
        alt="Poké Ball"
        className="mb-3 h-12 w-12 animate-floaty object-contain [image-rendering:pixelated]"
      />
      <h2 className="text-3xl font-black sm:text-4xl">
        {mode === 'menu' ? 'Your account' : 'Account'}
      </h2>
      <p className="mt-2 max-w-sm text-balance text-sm text-white/55">
        Accounts are optional — they just save your run history and Pokédex
        progress across devices. You can always play without one.
      </p>

      <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        {error && (
          <p className="mb-3 rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
        {info && (
          <p className="mb-3 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200">
            {info}
          </p>
        )}

        {mode === 'menu' && me && (
          <div className="flex flex-col gap-3 text-left">
            <div>
              <div className="text-lg font-bold">{me.displayName || 'Trainer'}</div>
              <div className="text-sm text-white/50">{me.email}</div>
            </div>
            {!me.emailVerified && (
              <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
                Your email isn’t verified yet — check your inbox for the
                confirmation link.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ['Runs', me.stats.runs],
                  ['Wins', me.stats.wins],
                  ['Losses', me.stats.losses],
                ] as const
              ).map(([label, n]) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/10 bg-white/[0.03] py-2"
                >
                  <div className="text-lg font-black">{n}</div>
                  <div className="text-[11px] uppercase tracking-wide text-white/45">
                    {label}
                  </div>
                </div>
              ))}
            </div>
            {onViewMyRuns && (
              <button
                type="button"
                onClick={onViewMyRuns}
                className="w-full rounded-full border border-white/20 px-6 py-2.5 text-sm font-bold transition hover:bg-white/10"
              >
                📜 My Runs
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={busy}
              className="w-full rounded-full border border-rose-300/30 px-6 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-60"
            >
              Sign out
            </button>
          </div>
        )}

        {(mode === 'signin' || mode === 'signup') && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (mode === 'signup') handleSignup();
              else handleLogin();
            }}
          >
            {mode === 'signup' && (
              <input
                className={INPUT}
                placeholder="Display name (optional)"
                value={displayName}
                maxLength={24}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            )}
            <input
              className={INPUT}
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className={INPUT}
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy
                ? 'Please wait…'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Sign in'}
            </button>

            <div className="my-1 flex items-center gap-3 text-xs text-white/30">
              <span className="h-px flex-1 bg-white/10" /> or{' '}
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={oauthUrl('discord')}
                className="rounded-full border border-indigo-300/30 bg-indigo-400/10 px-4 py-2.5 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-400/20"
              >
                Discord
              </a>
              <a
                href={oauthUrl('google')}
                className="rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
              >
                Google
              </a>
            </div>

            <div className="mt-1 flex items-center justify-between text-xs">
              {mode === 'signin' ? (
                <>
                  <button type="button" className={LINK} onClick={() => go('forgot')}>
                    Forgot password?
                  </button>
                  <button type="button" className={LINK} onClick={() => go('signup')}>
                    Create an account
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`${LINK} ml-auto`}
                  onClick={() => go('signin')}
                >
                  Already have an account? Sign in
                </button>
              )}
            </div>
          </form>
        )}

        {mode === 'forgot' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleForgot();
            }}
          >
            <p className="text-left text-sm text-white/55">
              Enter your email and we’ll send a link to reset your password.
            </p>
            <input
              className={INPUT}
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              className={`${LINK} text-xs`}
              onClick={() => go('signin')}
            >
              ← Back to sign in
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleReset();
            }}
          >
            <p className="text-left text-sm text-white/55">
              Choose a new password for your account.
            </p>
            <input
              className={INPUT}
              type="password"
              autoComplete="new-password"
              placeholder="New password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-8 rounded-full border border-white/20 px-6 py-3 font-bold transition hover:bg-white/10"
      >
        ← Back
      </button>
    </div>
  );
}
