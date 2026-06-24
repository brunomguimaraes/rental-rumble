import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Creature, Move } from '../game/types';
import { moveEffectLabel } from '../game/moves';
import { TYPE_COLORS, typeIconUrl, typeLabel } from '../game/typechart';

/**
 * Full-screen modal listing a Pokémon's full move pool. Unlike the games' fixed
 * four, every mon carries up to {@link MOVE_SLOTS} moves (the battle AI picks the
 * best each turn), so the list scrolls rather than crowding the selector cards.
 * Rendered through a portal so it positions against the viewport even when its
 * triggering card is mid-transform (selected/scaled).
 */
export function MovesModal({
  creature,
  onClose,
}: {
  creature: Creature;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const own = new Set(creature.types);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl border border-white/10 bg-[#0c0c14] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={creature.portrait}
              alt=""
              loading="lazy"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src !== creature.sprite) img.src = creature.sprite;
              }}
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-black">{creature.name}</h3>
              <p className="text-xs text-white/50">
                Carries {creature.moves.length} move
                {creature.moves.length === 1 ? '' : 's'} — the AI picks the best each
                turn
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/20 text-sm transition hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-2 overflow-y-auto pr-1">
          {creature.moves.map((move, i) => (
            <MoveRow key={`${move.name}-${i}`} move={move} stab={own.has(move.type)} />
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function MoveRow({ move, stab }: { move: Move; stab: boolean }) {
  const color = TYPE_COLORS[move.type];
  const isStatus = move.power === 0;
  return (
    <li
      className="flex items-center gap-3 rounded-2xl border p-2.5"
      style={{ borderColor: `${color}40`, background: `${color}12` }}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
        style={{ background: `${color}26`, border: `1px solid ${color}66` }}
      >
        <img
          src={typeIconUrl(move.type)}
          alt={typeLabel(move.type)}
          className="h-5 w-5 object-contain"
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-sm font-bold">{move.name}</span>
          {stab && <Tag>STAB</Tag>}
          {move.priority ? <Tag>Priority</Tag> : null}
          {move.pp ? <Tag>{move.pp} PP</Tag> : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-white/55">
          <span style={{ color }}>{typeLabel(move.type)}</span>
          {move.effect && (
            <span className="text-emerald-300/90">· {moveEffectLabel(move.effect)}</span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-sm font-bold tabular-nums">
          {isStatus ? '—' : move.power}
        </div>
        <div className="text-[9px] uppercase tracking-wider text-white/40">
          {isStatus ? 'Status' : 'Power'}
        </div>
      </div>
      <div className="w-9 shrink-0 text-right">
        <div className="text-sm font-bold tabular-nums">
          {Math.round(move.accuracy * 100)}%
        </div>
        <div className="text-[9px] uppercase tracking-wider text-white/40">Acc</div>
      </div>
    </li>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70">
      {children}
    </span>
  );
}
