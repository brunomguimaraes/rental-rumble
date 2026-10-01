import type { OwnedMon } from '../../game/box';
import { currentHp, isFainted, ownedMaxHp } from '../../game/health';
import { StatBar } from './StatBar';

/** Current HP between battles; FNT once a Pokémon has fainted. */
export function HpBar({ mon, showNumbers = false }: { mon: OwnedMon; showNumbers?: boolean }) {
  const max = ownedMaxHp(mon);
  const hp = currentHp(mon);
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <span className="font-label text-[8px] uppercase text-info">HP</span>
      {isFainted(mon) ? (
        <span className="font-label text-[9px] uppercase text-accent">FNT</span>
      ) : (
        <StatBar value={hp} max={max} tone="night" label={`HP ${hp} of ${max}`} segments={8} />
      )}
      {showNumbers && <span className="shrink-0 font-label text-[9px] text-ink-dim">{hp}/{max}</span>}
    </div>
  );
}
