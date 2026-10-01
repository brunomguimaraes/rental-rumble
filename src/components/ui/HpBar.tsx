import type { OwnedMon } from '../../game/box';
import { currentHp, hpTone, ownedMaxHp, type HpTone } from '../../game/health';
import { StatBar } from './StatBar';

const FILL_TONE = { healthy: 'hp', low: 'hp-low', critical: 'hp-critical' } as const satisfies Record<Exclude<HpTone, 'fainted'>, string>;

/** Current HP between battles, green → amber → red as it drops; FNT once a Pokémon has fainted. */
export function HpBar({ mon, showNumbers = false, label = 'HP' }: { mon: OwnedMon; showNumbers?: boolean; label?: string }) {
  const max = ownedMaxHp(mon);
  const hp = currentHp(mon);
  const tone = hpTone(hp, max);
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <span className="font-label text-[8px] uppercase text-info">{label}</span>
      {tone === 'fainted' ? (
        <span className="font-label text-[9px] uppercase text-accent">FNT</span>
      ) : (
        <StatBar value={hp} max={max} tone={FILL_TONE[tone]} label={`${label} ${hp} of ${max}`} segments={8} />
      )}
      {showNumbers && <span className="shrink-0 font-label text-[9px] text-ink-dim">{hp}/{max}</span>}
    </div>
  );
}
