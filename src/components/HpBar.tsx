export function HpBar({
  hp,
  maxHp,
  compact = false,
}: {
  hp: number;
  maxHp: number;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const color =
    pct > 50 ? '#34d399' : pct > 20 ? '#facc15' : '#f87171';
  return (
    <div className="w-full">
      <div
        className={`w-full overflow-hidden rounded-full bg-black/40 ${
          compact ? 'h-1.5' : 'h-2.5'
        }`}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {!compact && (
        <div className="mt-1 text-right text-[11px] tabular-nums text-white/60">
          {Math.max(0, Math.ceil(hp))} / {maxHp}
        </div>
      )}
    </div>
  );
}
