/** Sliding-panel puzzles: seeded scrambles that are always solvable, legal moves only, and a solved check. */
import {
  applyMove, applyMoves, generatePuzzle, isSolved, manhattan, neighbours, simplifyMoves, solvedBoard,
} from '../src/game/sliding-puzzle.js';
import { RNG } from '../src/game/rng.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const rules = { size: 3, slides: 40, minDistance: 10 };

/** For an odd width, a board is reachable from solved exactly when its panels have an even number of inversions. */
function inversions(board: readonly number[]): number {
  const panels = board.filter((v) => v !== 0);
  let n = 0;
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) if (panels[i] > panels[j]) n++;
  return n;
}

check('the solved 3×3 board reads 1–8 with the gap last', same(solvedBoard(3), [1, 2, 3, 4, 5, 6, 7, 8, 0]) && isSolved(solvedBoard(3)));
check('a corner has two neighbours, an edge three and the centre four; rows never wrap', same(neighbours(0, 3).sort(), [1, 3]) && same(neighbours(4, 3).sort(), [1, 3, 5, 7]) && same(neighbours(2, 3).sort(), [1, 5]) && same(neighbours(3, 3).sort(), [0, 4, 6]));
const nearlySolved = [1, 2, 3, 4, 5, 6, 7, 0, 8];
check('a panel next to the gap slides into it', same(applyMove(nearlySolved, 8), solvedBoard(3)));
check('a panel away from the gap cannot move', applyMove(nearlySolved, 0) === null);
check('the gap itself is not a move', applyMove(nearlySolved, 7) === null);
check('out-of-range and fractional indexes are not moves', [-1, 9, 1.5, Number.NaN].every((m) => applyMove(nearlySolved, m) === null));
check('a move leaves its input board unchanged', same(nearlySolved, [1, 2, 3, 4, 5, 6, 7, 0, 8]));
const twoAway = [1, 2, 3, 4, 0, 6, 7, 5, 8];
const replay = applyMoves(twoAway, [7, 8]);
check('a legal move list replays to solved', replay !== null && isSolved(replay));
check('one illegal move voids the whole list', applyMoves(twoAway, [7, 0, 8]) === null);
check('a list that stops short is not solved', !isSolved(applyMoves(twoAway, [7]) ?? solvedBoard(3)));
check('Manhattan distance sums each panel\'s rows and columns from home',
  manhattan(solvedBoard(3)) === 0 && manhattan(twoAway) === 2 && manhattan([8, 2, 3, 4, 5, 6, 7, 1, 0]) === 6);

const boards = Array.from({ length: 500 }, (_, i) => generatePuzzle(`seed-${i}`, rules));
check('the same seed scrambles the same board', same(generatePuzzle('seed-7', rules), boards[7]));
check('every scramble holds each panel and the gap once', boards.every((b) => same([...b].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7, 8])));
check('every scramble is solvable', boards.every((b) => inversions(b) % 2 === 0));
check('every scramble is at least distance 10 from solved', boards.every((b) => manhattan(b) >= 10 && !isSolved(b)));
check('scrambles vary from seed to seed', new Set(boards.map((b) => b.join())).size > 450);

// A solve sends its slides without detours, so wandering never pushes it past MAX_PUZZLE_MOVES.
const start = boards[3];
const firstSlide = neighbours(start.indexOf(0), 3)[0];
check('a slide and the slide straight back cancel out', same(simplifyMoves(start, [firstSlide, start.indexOf(0)]), []));
check('no slides stay no slides', same(simplifyMoves(start, []), []));
// The gap walks a snake through every square once, so no board repeats; walking it back is a loop-free solution.
const snaked = applyMoves(solvedBoard(3), [7, 6, 3, 4, 5, 2, 1, 0])!;
const loopFree = [1, 2, 5, 4, 3, 6, 7, 8];
const rotation = [1, 0, 3, 4, 1, 0, 3, 4, 1, 0, 3, 4];
const midway = applyMoves(snaked, loopFree.slice(0, 4))!;
const wandering = [...loopFree.slice(0, 4), 1, 4, ...rotation, ...loopFree.slice(4)];
const shortened = simplifyMoves(snaked, wandering);
check('a solution with a wandering loop still solves, and is no longer than without it', isSolved(applyMoves(snaked, loopFree) ?? []) && same(applyMoves(midway, rotation), midway)
  && isSolved(applyMoves(snaked, shortened) ?? []) && shortened.length <= loopFree.length && wandering.length > loopFree.length);
const walks = Array.from({ length: 300 }, (_, i) => {
  const rng = new RNG(`walk-${i}`);
  const moves: number[] = [];
  let board: readonly number[] = start;
  for (let n = rng.int(0, 400); n > 0; n--) {
    const move = rng.pick(neighbours(board.indexOf(0), 3));
    moves.push(move);
    board = applyMove(board, move)!;
  }
  return { moves, end: board, short: simplifyMoves(start, moves) };
});
check('a shortened walk ends on the same board as the walk', walks.every((w) => same(applyMoves(start, w.short), w.end)));
check('a shortened walk never comes back to a board it has left', walks.every((w) => {
  const seen = [start.join()];
  let board: readonly number[] = start;
  for (const move of w.short) { board = applyMove(board, move) ?? []; seen.push(board.join()); }
  return new Set(seen).size === seen.length;
}) && walks.some((w) => w.short.length < w.moves.length));
check('an illegal list comes back as sent, for the server to refuse', same(simplifyMoves(nearlySolved, [8, 0, 7]), [8, 0, 7]));

console.log(`Sliding puzzle: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
