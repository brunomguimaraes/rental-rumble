import { useId, useState } from 'react';
import { itemById } from '../../game/items';
import type { PublicPuzzle } from '../../game/route-actions';
import { applyMove, isSolved, neighbours } from '../../game/sliding-puzzle';
import { panelStyle, scenePreviewStyle } from './puzzle-art';

/** Which way a panel next to the gap would slide. */
function direction(index: number, gap: number, size: number): 'up' | 'down' | 'left' | 'right' {
  if (index === gap - size) return 'down';
  if (index === gap + size) return 'up';
  return index === gap - 1 ? 'right' : 'left';
}

const rewardText = (puzzle: PublicPuzzle) => puzzle.reward.map((item) => {
  const def = itemById(item.itemId);
  return `${item.quantity} ${item.quantity === 1 ? def?.name ?? item.itemId : def?.plural ?? item.itemId}`;
}).join(', ');

/**
 * A sliding-panel puzzle. Slides stay on this screen; once the picture is whole the move list goes to the server,
 * which replays it from its own copy of the board. Reopening the puzzle starts from that board again.
 */
export function PuzzleView({ puzzle, busy, locked, onSolve, onLeave }: {
  puzzle: PublicPuzzle;
  busy: boolean;
  locked: boolean;
  onSolve: (moves: number[]) => void;
  onLeave: () => void;
}) {
  const heading = useId();
  const [play, setPlay] = useState(() => ({ board: [...puzzle.board], moves: [] as number[] }));
  const { size } = puzzle;
  const gap = play.board.indexOf(0);
  const movable = neighbours(gap, size);
  const solved = isSolved(play.board);
  const cell = 100 / size;
  const slide = (index: number) => {
    const board = locked || solved ? null : applyMove(play.board, index);
    if (!board) return;
    const moves = [...play.moves, index];
    setPlay({ board, moves });
    if (isSolved(board)) onSolve(moves);
  };

  return <section className="ui-window m-2" aria-labelledby={heading} aria-busy={busy}>
    <div className="flex items-center justify-between gap-2 border-b-2 border-window-frame px-3 py-2">
      <h2 id={heading} className="font-label text-[10px] uppercase text-info">Stone panels</h2>
      <span role="status" className="font-label text-[10px] uppercase text-ink">{solved ? 'Solved!' : `Moves ${play.moves.length}`}</span>
    </div>
    <div className="p-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="h-16 w-16 shrink-0 border-2 border-edge bg-no-repeat" style={scenePreviewStyle(puzzle.scene)} />
        <div className="min-w-0 text-sm"><p>Slide the panels back into the picture.</p><p className="mt-1 text-ink-dim">Tap a panel beside the gap. Reward: <span className="text-accent">{rewardText(puzzle)}</span></p></div>
      </div>
      <div role="group" aria-label="Puzzle board" className="relative mx-auto mt-3 aspect-square w-full max-w-[320px] border-2 border-edge bg-slot">
        {play.board.map((value, index) => value === 0 ? null : <button key={value} type="button"
          disabled={locked || solved || !movable.includes(index)} onClick={() => slide(index)}
          aria-label={!solved && movable.includes(index) ? `Panel ${value}, slide ${direction(index, gap, size)}` : `Panel ${value}`}
          className="ui-focus absolute border border-edge bg-no-repeat motion-safe:transition-[left,top] motion-safe:duration-150 motion-safe:ease-[steps(3)]"
          style={{ ...panelStyle(puzzle.scene, value, size), left: `${(index % size) * cell}%`, top: `${Math.floor(index / size) * cell}%`, width: `${cell}%`, height: `${cell}%` }}>
          <span aria-hidden="true" className="absolute left-0 top-0 bg-edge px-1 font-label text-[9px] text-ink">{value}</span>
        </button>)}
      </div>
      {solved && <button type="button" disabled={locked} onClick={() => onSolve(play.moves)} className="ui-button-primary ui-focus mt-3 min-h-12 w-full px-3 font-label text-[10px] uppercase">{busy ? 'Checking…' : 'Submit solution'}</button>}
      <button type="button" disabled={locked} onClick={onLeave} className="ui-button ui-focus mt-3 min-h-11 w-full px-3 text-sm">Give up (no reward)</button>
    </div>
  </section>;
}
