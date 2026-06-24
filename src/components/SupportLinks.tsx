import { useState } from 'react';

const COFFEE_URL = 'https://buymeacoffee.com/pokerentalrumble';
const PIX_KEY = 'pokerentalrumble@gmail.com';

/** Small "support the project" row: a Buy Me a Coffee link and a one-tap
 *  copy button for the Pix key. Reused on the title and result screens. */
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
