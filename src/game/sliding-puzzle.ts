import { RNG } from './rng.js';

// Sliding-panel puzzles: a board is generated from a seed and played one slide at a time.
// Pure: the server generates and verifies, the Puzzle screen plays.

/** Panels in reading order, 1..size²-1, with 0 for the gap. */
export type PuzzleBoard = readonly number[];
export interface PuzzleRules {
  size: number;
  /** Random slides away from the solved board. */
  slides: number;
  /** The scramble keeps sliding until it is at least this far from solved. */
  minDistance: number;
}

/** The longest move list a solve may send. */
export const MAX_PUZZLE_MOVES = 500;
// A bound on the extra slides that push a scramble out to its minimum distance.
const EXTRA_SLIDES = 400;

export function solvedBoard(size: number): number[] {
  return Array.from({ length: size * size }, (_, i) => (i === size * size - 1 ? 0 : i + 1));
}

export function isSolved(board: PuzzleBoard): boolean {
  return board.length > 0 && board.every((value, i) => value === (i === board.length - 1 ? 0 : i + 1));
}

const widthOf = (board: PuzzleBoard): number => Math.round(Math.sqrt(board.length));

/** Board indexes next to `index`: up, down, left, right. */
export function neighbours(index: number, size: number): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const out: number[] = [];
  if (row > 0) out.push(index - size);
  if (row < size - 1) out.push(index + size);
  if (col > 0) out.push(index - 1);
  if (col < size - 1) out.push(index + 1);
  return out;
}

/** Each panel's row and column distance from its solved place, summed. */
export function manhattan(board: PuzzleBoard): number {
  const size = widthOf(board);
  let total = 0;
  board.forEach((value, i) => {
    if (value === 0) return;
    const home = value - 1;
    total += Math.abs(Math.floor(i / size) - Math.floor(home / size)) + Math.abs((i % size) - (home % size));
  });
  return total;
}

/** Slide the panel at `index` into the gap; null when it isn't next to the gap. */
export function applyMove(board: PuzzleBoard, index: number): number[] | null {
  const gap = board.indexOf(0);
  if (!neighbours(gap, widthOf(board)).includes(index)) return null;
  const next = [...board];
  next[gap] = next[index];
  next[index] = 0;
  return next;
}

/** Every move in order; null as soon as one is illegal. */
export function applyMoves(board: PuzzleBoard, moves: readonly number[]): number[] | null {
  let current: number[] | null = [...board];
  for (const move of moves) {
    current = applyMove(current, move);
    if (!current) return null;
  }
  return current;
}

/**
 * The same slides without their detours: replays `moves` from `board` and, whenever a board repeats, cuts the path back
 * to where that board was first reached. The result ends on the same board and never visits a board twice, so a long,
 * wandering solve still fits MAX_PUZZLE_MOVES. A list with an illegal move comes back as sent, for the server to refuse.
 */
export function simplifyMoves(board: PuzzleBoard, moves: readonly number[]): number[] {
  const path: number[] = [];
  // trail[i] is the board after the path's first i moves; reachedAt maps each of those boards back to i.
  const trail = [board.join()];
  const reachedAt = new Map([[trail[0], 0]]);
  let current: PuzzleBoard = board;
  for (const move of moves) {
    const next = applyMove(current, move);
    if (!next) return [...moves];
    current = next;
    const key = next.join();
    const at = reachedAt.get(key);
    if (at === undefined) {
      path.push(move);
      trail.push(key);
      reachedAt.set(key, path.length);
    } else {
      while (trail.length > at + 1) reachedAt.delete(trail.pop()!);
      path.length = at;
    }
  }
  return path;
}

/** A solvable scramble: legal slides from the solved board, never undoing the slide before. */
export function generatePuzzle(seed: string, rules: PuzzleRules): number[] {
  const rng = new RNG(seed);
  let board = solvedBoard(rules.size);
  let previousGap = -1;
  const slide = () => {
    const gap = board.indexOf(0);
    // The panel that just moved now sits where the gap was; sliding it back would undo that move.
    const index = rng.pick(neighbours(gap, rules.size).filter((i) => i !== previousGap));
    board = applyMove(board, index)!;
    previousGap = gap;
  };
  for (let i = 0; i < rules.slides; i++) slide();
  for (let i = 0; i < EXTRA_SLIDES && manhattan(board) < rules.minDistance; i++) slide();
  return board;
}
