import type { OwnedMon } from '../../game/box';
import { currentHp, isFainted, ownedMaxHp } from '../../game/health';
import { hpFill } from './hp-fill';
import { StatBar } from './StatBar';

/** Current HP between battles, green → amber → red as it drops; FNT once a Pokémon has fainted. */
export function HpBar({ mon, showNumbers = false, label = 'HP' }: { mon: OwnedMon; showNumbers?: boolean; label?: string }) {
  const max = ownedMaxHp(mon);
  const hp = currentHp(mon);
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <span className="font-label text-[8px] uppercase text-info">{label}</span>
      {isFainted(mon) ? (
        <span className="font-label text-[9px] uppercase text-accent">FNT</span>
      ) : (
        <StatBar value={hp} max={max} tone={hpFill(hp, max)} label={`${label} ${hp} of ${max}`} segments={8} />
      )}
      {showNumbers && <span className="shrink-0 font-label text-[9px] text-ink-dim">{hp}/{max}</span>}
    </div>
  );
}
