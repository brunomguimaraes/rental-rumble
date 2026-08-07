import { useState } from 'react';
import {
  signup,
  login,
  requestReset,
  resetPassword,
  oauthUrl,
  type AccountUser,
} from '../game/account';
import { TypeMarquee } from './TypeMarquee';

// The front door. Accounts are now required — there is no guest play — so this
// is a full-viewport branded landing, not a modal bolted onto the Title screen.
// It reuses the existing custom auth (email/password + Discord/Google OAuth).

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

const INPUT =
  'w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none';
const PRIMARY =
  'w-full rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60';
const OAUTH =
  'flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]';
const LINK = 'text-white/60 underline-offset-2 hover:text-white hover:underline';

export function LoginScreen({
  resetToken,
  onAuthed,
}: {
  resetToken?: string | null;
  onAuthed: (user: AccountUser) => void;
}) {
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const handleSignin = async () => {
    clear();
    setBusy(true);
    const r = await login({ email, password });
    setBusy(false);
    if (r.ok && r.user) onAuthed(r.user);
    else setError(r.error ?? 'could not sign in');
  };

  const handleSignup = async () => {
    clear();
    setBusy(true);
    const r = await signup({ email, password, displayName });
    setBusy(false);
    if (r.ok && r.user) onAuthed(r.user);
    else setError(r.error ?? 'could not create account');
  };

  const handleForgot = async () => {
    clear();
    setBusy(true);
    await requestReset(email);
    setBusy(false);
    setInfo('If that email has an account, a reset link is on its way. Check your inbox.');
  };

  const handleReset = async () => {
    clear();
    if (!resetToken) return;
    setBusy(true);
    const r = await resetPassword(resetToken, password);
    setBusy(false);
    if (r.ok && r.user) onAuthed(r.user);
    else setError(r.error ?? 'could not reset password');
  };

  const submit = () => {
    if (mode === 'signin') return handleSignin();
    if (mode === 'signup') return handleSignup();
    if (mode === 'forgot') return handleForgot();
    return handleReset();
  };

  const title =
    mode === 'signup'
      ? 'Create your trainer'
      : mode === 'forgot'
        ? 'Reset your password'
        : mode === 'reset'
          ? 'Choose a new password'
          : 'Sign in to play';

  return (
    <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center px-5 py-10">
      <img
        src={`${import.meta.env.BASE_URL}sprites/ui/pokeball.png`}
        alt="Poké Ball"
        className="mb-4 h-16 w-16 animate-floaty object-contain [image-rendering:pixelated] drop-shadow-[0_4px_16px_rgba(255,80,80,0.35)] sm:h-20 sm:w-20"
      />
      <h1 className="bg-gradient-to-br from-white via-white to-white/50 bg-clip-text text-center text-4xl font-black tracking-tight text-transparent sm:text-6xl">
        RENTAL RUMBLE
      </h1>
      <p className="mt-3 max-w-sm text-balance text-center text-white/60">
        Catch, raise and battle your own team of real Pokémon. Sign in to start
        your collection.
      </p>

      <div className="mt-6 w-full">
        <TypeMarquee />
      </div>

      <form
        className="mt-8 w-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) submit();
        }}
      >
        <div className="mb-4 text-sm font-bold uppercase tracking-widest text-white/50">
          {title}
        </div>

        {mode !== 'reset' && (
          <input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        )}

        {mode === 'signup' && (
          <input
            type="text"
            autoComplete="nickname"
            placeholder="Trainer name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={`${INPUT} mt-3`}
          />
        )}

        {mode !== 'forgot' && (
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'reset' ? 'New password' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${INPUT} mt-3`}
          />
        )}

        {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
        {info && <div className="mt-3 text-sm text-emerald-300">{info}</div>}

        <button type="submit" disabled={busy} className={`${PRIMARY} mt-5`}>
          {busy
            ? '…'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'forgot'
                ? 'Send reset link'
                : mode === 'reset'
                  ? 'Set password'
                  : 'Sign in'}
        </button>

        {(mode === 'signin' || mode === 'signup') && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-widest text-white/30">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="grid gap-2">
              <a href={oauthUrl('discord')} className={OAUTH}>
                Continue with Discord
              </a>
              <a href={oauthUrl('google')} className={OAUTH}>
                Continue with Google
              </a>
            </div>
          </>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          {mode === 'signin' && (
            <>
              <button type="button" className={LINK} onClick={() => go('signup')}>
                Create an account
              </button>
              <button type="button" className={LINK} onClick={() => go('forgot')}>
                Forgot password?
              </button>
            </>
          )}
          {(mode === 'signup' || mode === 'forgot' || mode === 'reset') && (
            <button type="button" className={LINK} onClick={() => go('signin')}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
