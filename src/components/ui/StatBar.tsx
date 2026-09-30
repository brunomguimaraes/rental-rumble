type Tone = 'lcd' | 'night';

const FILL: Record<Tone, string> = { lcd: 'bg-lcd-ink', night: 'bg-exp' };
const TROUGH: Record<Tone, string> = { lcd: 'bg-lcd-dim', night: 'bg-edge' };

/**
 * A segmented block bar. `value` out of `max` rounds up to whole segments, so
 * any non-zero value lights at least one block; values above `max` fill it.
 */
export function StatBar({
  value,
  max,
  tone,
  label,
  segments = 10,
}: {
  value: number;
  max: number;
  tone: Tone;
  label: string;
  segments?: number;
}) {
  const filled = value <= 0 ? 0 : Math.min(segments, Math.ceil((value / max) * segments));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="flex min-w-0 flex-1 gap-px"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={`h-2 flex-1 ${i < filled ? FILL[tone] : TROUGH[tone]}`} />
      ))}
    </div>
  );
}
