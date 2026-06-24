import { useRef, useState } from 'react';
import type { Creature } from '../game/types';
import { signIconUrl, signLabel, signSummary } from '../game/zodiac';
import { MiniSprite } from './MiniSprite';

interface DragState {
  from: number;
  over: number;
  x: number;
  y: number;
}

const DRAG_THRESHOLD = 6;

/**
 * Reorder the team lineup (slot 1 is the lead). Works three ways so it feels
 * right on every device:
 *  - drag a Pokémon onto another slot (pointer events → touch + mouse),
 *  - tap one then tap a slot to drop it there,
 *  - focus a card and use ← / → (and Enter/Space to select) for keyboards.
 */
export function LineupEditor({
  team,
  onChange,
}: {
  team: Creature[];
  onChange: (team: Creature[]) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pressRef = useRef<{
    from: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= team.length) return;
    const next = [...team];
    const [c] = next.splice(from, 1);
    next.splice(to, 0, c);
    onChange(next);
  };

  // Nearest slot to a screen point (handles wrapped multi-row grids).
  const slotAt = (x: number, y: number): number => {
    let best = 0;
    let bestDist = Infinity;
    slotRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const tap = (i: number) => {
    setSelected((cur) => {
      if (cur === null) return i;
      if (cur === i) return null;
      move(cur, i);
      return null;
    });
  };

  const onPointerDown = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button != null && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressRef.current = {
      from: i,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const p = pressRef.current;
    if (!p) return;
    if (!p.dragging) {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD)
        return;
      p.dragging = true;
    }
    setDrag({
      from: p.from,
      over: slotAt(e.clientX, e.clientY),
      x: e.clientX,
      y: e.clientY,
    });
  };

  const endPress = (i: number) => (e: React.PointerEvent<HTMLElement>) => {
    const p = pressRef.current;
    pressRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    if (p?.dragging && drag) {
      move(drag.from, drag.over);
      setSelected(null);
    } else {
      tap(i);
    }
    setDrag(null);
  };

  const onKeyDown = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(i, i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(i, i + 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tap(i);
    }
  };

  const dragged = drag !== null ? team[drag.from] : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-xs uppercase tracking-wider text-white/40">
          Your lineup
        </span>
        <span className="text-[11px] text-white/35">
          {selected !== null
            ? `Tap a slot to move ${team[selected].name} there`
            : 'Slot 1 leads — drag or tap to reorder'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {team.map((c, i) => {
          const isDragSrc = drag?.from === i;
          const isOver = drag && drag.over === i && drag.from !== i;
          const isSelected = selected === i;
          const isLead = i === 0;
          return (
            <div
              // Slot position is the key: two of the same species share `c.id`,
              // and duplicate React keys mis-reconcile the cards (and their
              // position-indexed refs) so reordering breaks. These cards are
              // stateless and derived purely from props, so an index key is safe.
              key={i}
              ref={(el) => {
                slotRefs.current[i] = el;
              }}
              role="button"
              tabIndex={0}
              aria-label={`${c.name}, slot ${i + 1}${isLead ? ' (lead)' : ''}. Use arrow keys to reorder.`}
              onPointerDown={onPointerDown(i)}
              onPointerMove={onPointerMove}
              onPointerUp={endPress(i)}
              onPointerCancel={endPress(i)}
              onKeyDown={onKeyDown(i)}
              title={`${c.name} · ${c.types.join('/')}\n${signSummary(c.sign)}`}
              className={`relative flex touch-none select-none flex-col items-center gap-1 rounded-xl border p-2 transition ${
                isLead
                  ? 'border-amber-300/40 bg-amber-300/[0.06]'
                  : 'border-white/10 bg-white/5'
              } ${isSelected ? 'ring-2 ring-sky-300/70' : ''} ${
                isOver ? 'ring-2 ring-white/70' : ''
              } ${isDragSrc ? 'opacity-30' : 'hover:bg-white/10'} cursor-grab active:cursor-grabbing`}
            >
              <span
                className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                  isLead ? 'bg-amber-300 text-amber-950' : 'bg-white/10 text-white/50'
                }`}
              >
                {isLead ? 'Lead' : i + 1}
              </span>
              <MiniSprite
                creature={c}
                className="pointer-events-none mt-3 h-10 w-10"
              />
              <span className="pointer-events-none flex items-center gap-1 text-center text-xs font-semibold leading-tight">
                {c.name}
                <img
                  src={signIconUrl(c.sign)}
                  alt={signLabel(c.sign)}
                  className="h-3.5 w-3.5 object-contain opacity-80"
                />
              </span>
            </div>
          );
        })}
      </div>

      {/* Floating clone that follows the finger/cursor while dragging. */}
      {drag && dragged && (
        <div
          className="pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-white/40 bg-[#14141c] p-2 shadow-2xl"
          style={{ left: drag.x, top: drag.y }}
        >
          <MiniSprite creature={dragged} className="h-10 w-10" />
          <span className="text-xs font-semibold">{dragged.name}</span>
        </div>
      )}
    </div>
  );
}
