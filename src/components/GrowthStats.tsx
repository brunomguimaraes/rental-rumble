import { useState } from 'react';
import type { OwnedMon } from '../game/box';
import { STAT_KEYS, STAT_LABELS, potentialSentence, speciesGrowth, type StatKey } from '../game/growth';
import { StatBar } from './ui/StatBar';

/**
 * Six stat rows: a bar filled to the species' ceiling, the number, a MAX pip
 * when the stat won't go any higher, and the Judge line on tap. No level here.
 */
export function GrowthStats({ mon }: { mon: OwnedMon }) {
  const [openKey, setOpenKey] = useState<StatKey | null>(null);
  const g = speciesGrowth(mon.dexId, mon.build);
  if (!g) return null;
  return (
    <ul className="mt-4 flex flex-col gap-1.5">
      {STAT_KEYS.map((k) => {
        const value = mon.stats[k];
        const capped = value >= g.ceiling[k];
        const open = openKey === k;
        return (
          <li key={k}>
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : k)}
              aria-expanded={open}
              className="ui-focus flex w-full items-center gap-2 text-left"
            >
              <span className="w-12 shrink-0 font-label text-[9px] uppercase text-info">{STAT_LABELS[k].short}</span>
              <StatBar value={value} max={g.ceiling[k]} tone="night" label={`${STAT_LABELS[k].long} ${value}`} />
              <span className="w-8 shrink-0 text-right font-label text-[10px] text-white">{value}</span>
              <span className="w-7 shrink-0 font-label text-[8px] uppercase text-accent">{capped ? 'MAX' : ''}</span>
            </button>
            {open && <p className="mt-1 pl-14 text-xs text-white/60">{potentialSentence(k, g.potential[k])}</p>}
          </li>
        );
      })}
    </ul>
  );
}
