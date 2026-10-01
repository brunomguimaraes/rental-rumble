import { clampLevel, expPercent, MAX_LEVEL } from '../../game/levels';
import { StatBar } from './StatBar';

/**
 * The EXP bar: progress toward the next hidden level, MAX at the cap. It never
 * prints the level; that number stays on the server side of the screen.
 */
export function ExpBar({ level, exp, showPercent = false }: { level: number; exp: number; showPercent?: boolean }) {
  const maxed = clampLevel(level) >= MAX_LEVEL;
  const pct = expPercent(level, exp);
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <span className="font-label text-[8px] uppercase text-info">EXP</span>
      {maxed ? (
        <span className="font-label text-[9px] uppercase text-accent">MAX</span>
      ) : (
        <StatBar value={pct} max={100} tone="night" label={`EXP ${pct}%`} segments={8} />
      )}
      {showPercent && !maxed && <span className="font-label text-[9px] text-ink-dim">{pct}%</span>}
    </div>
  );
}
