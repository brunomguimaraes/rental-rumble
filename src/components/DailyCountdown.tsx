import { useEffect, useState } from 'react';
import { nextDailyResetMs } from '../game/opponents';

// The chunky 8-bit clock face, reusing the same pixel typeface as the in-battle
// damage numbers and the leaderboard ranks.
const PIXEL_FONT = "'Press Start 2P', 'Courier New', monospace";

function format(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Live countdown to the next daily reset (see DAILY_RESET_UTC_HOUR / the boss &
 * board flip). Rendered in the pixel arcade font. Recomputes its target each tick
 * from `nextDailyResetMs`, so it rolls straight over to the next day at 00:00:00
 * without drift, and a tab left open overnight just keeps counting.
 */
export function DailyCountdown({
  className = '',
  label = 'Next boss in',
}: {
  className?: string;
  label?: string;
}) {
  const [remaining, setRemaining] = useState(
    () => nextDailyResetMs() - Date.now(),
  );

  useEffect(() => {
    const tick = () => setRemaining(nextDailyResetMs() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 ${className}`}
      title="Time until the daily boss and leaderboard reset"
    >
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
        {label}
      </span>
      <span
        className="text-[11px] leading-none text-amber-200"
        style={{ fontFamily: PIXEL_FONT, letterSpacing: '0.04em' }}
      >
        {format(remaining)}
      </span>
    </div>
  );
}
