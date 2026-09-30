import { MAX_LEVEL, expToNext } from '../../game/levels';
import { StatBar } from '../ui/StatBar';

/** Progress toward the next level as a segmented cyan bar; MAX at the cap. */
export function ExpMeter({ level, exp, segments = 8 }: { level: number; exp: number; segments?: number }) {
  if (level >= MAX_LEVEL) {
    return <span className="font-label text-[9px] uppercase text-accent">Max</span>;
  }
  const need = expToNext(level);
  return <StatBar value={exp} max={need} tone="night" label={`EXP ${exp} of ${need}`} segments={segments} />;
}
