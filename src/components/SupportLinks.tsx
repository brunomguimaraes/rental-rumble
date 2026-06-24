const AUTHOR_URL = 'https://github.com/brunomguimaraes';

// Donations are hidden for now to reduce commercial/legal exposure while the
// project is shared publicly. To re-enable, restore the imports and the
// commented donation implementation at the bottom of this file, and swap it
// back in for the builder-credit row below.

/** Small footer row. Donations are currently hidden; instead we show a small
 *  builder credit. Reused on the title, result, and ladder screens. */
export function SupportLinks({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 ${className}`}
    >
      <a
        href={AUTHOR_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-200"
      >
        Built with <span aria-hidden>♥</span> by{' '}
        <span className="font-semibold text-slate-300">brunomguimaraes</span>
      </a>
    </div>
  );
}

/* --- Donations (hidden for now) ---------------------------------------------
import { useState } from 'react';

const COFFEE_URL = 'https://buymeacoffee.com/pokerentalrumble';
const PIX_KEY = 'pokerentalrumble@gmail.com';

export function SupportLinks({ className = '' }: { className?: string }) {
  const [pixRevealed, setPixRevealed] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const copyPix = async () => {
    setPixRevealed(true);
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — the key stays visible
      // so it can be copied by hand.
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 ${className}`}
    >
      <a
        href={COFFEE_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-300/20"
      >
        <span aria-hidden>☕</span> Buy me a coffee
      </a>
      <button
        type="button"
        onClick={copyPix}
        title={`Copy Pix key: ${PIX_KEY}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-300/20"
      >
        <span aria-hidden>🇧🇷</span>{' '}
        {pixRevealed ? (
          <>
            <span className="font-mono">{PIX_KEY}</span>
            <span className="text-emerald-300/80">
              {pixCopied ? '· copied ✓' : '· tap to copy'}
            </span>
          </>
        ) : (
          'Pix'
        )}
      </button>
    </div>
  );
}
--------------------------------------------------------------------------- */
