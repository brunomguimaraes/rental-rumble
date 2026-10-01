import type { MeterView } from '../../game/meter';
import { waitText } from '../world/route-copy';

const SEGMENTS = 12;

/** One stamina meter: segmented fill, count, and time to the next point. Below zero reads as debt. */
export function StaminaMeter({ label, meter, now, fill }: { label: 'Travel' | 'Actions'; meter: MeterView; now: number; fill: 'bg-info' | 'bg-exp' }) {
  const debt = meter.available < 0;
  const lit = debt ? 0 : Math.ceil((Math.min(meter.available, meter.capacity) / meter.capacity) * SEGMENTS);
  const owed = debt ? Math.ceil((-meter.available / meter.capacity) * SEGMENTS) : 0;
  const wait = meter.nextRefillAt === null ? null : waitText(Math.max(0, meter.nextRefillAt - now));
  // The count column is a fixed width (fits "-12/12") so the Travel and Actions bars line up.
  return (
    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] items-center gap-x-2">
      <span className="font-label text-[9px] uppercase text-info">{label}</span>
      <div role="meter" aria-label={`${label} ${meter.available} of ${meter.capacity}${wait ? `, next in ${wait}` : ', full'}`}
        aria-valuenow={meter.available} aria-valuemin={debt ? meter.available : 0} aria-valuemax={meter.capacity} className="flex min-w-0 gap-px">
        {Array.from({ length: SEGMENTS }, (_, i) => <span key={i} className={`h-2 flex-1 ${i < lit ? fill : i < owed ? 'bg-danger' : 'bg-edge'}`} />)}
      </div>
      <span className={`text-right font-label text-[10px] ${debt ? 'text-danger' : 'text-ink'}`}>{meter.available}/{meter.capacity}</span>
      <span aria-hidden="true" className="col-start-2 col-end-4 text-right font-label text-[9px] uppercase text-ink-dim">{wait ? `+1 in ${wait}` : 'Full'}</span>
    </div>
  );
}
