import type { Level, GameStatus, Direction } from '../types';
import { cloneLevel } from './level';
import { executeTurn, executeSkipTurn, cycleSoul, isLevelCleared } from '../engine/turn';

// A 풀이(solution) is a recorded sequence of the player's actions while clearing a
// map. It is stored as a compact letter string (one char per action) so it fits in
// a single text column and travels with the map code.
export type SolutionMove = 'up' | 'down' | 'left' | 'right' | 'wait' | 'soul';

const MOVE_TO_CHAR: Record<SolutionMove, string> = {
  up: 'U', down: 'D', left: 'L', right: 'R', wait: 'W', soul: 'M',
};
const CHAR_TO_MOVE: Record<string, SolutionMove> = {
  U: 'up', D: 'down', L: 'left', R: 'right', W: 'wait', M: 'soul',
};

// Human-facing label + arrow for the playback readout.
export const MOVE_LABEL: Record<SolutionMove, string> = {
  up: '▲ 위', down: '▼ 아래', left: '◀ 왼쪽', right: '▶ 오른쪽', wait: '⏸ 대기', soul: '🌀 영혼이동',
};

export function encodeSolution(moves: SolutionMove[]): string {
  return moves.map((m) => MOVE_TO_CHAR[m]).join('');
}

// Parse a stored solution string. Returns null if it contains any unknown char.
export function decodeSolution(str: string): SolutionMove[] | null {
  const moves: SolutionMove[] = [];
  for (const ch of str.trim()) {
    const m = CHAR_TO_MOVE[ch];
    if (!m) return null;
    moves.push(m);
  }
  return moves;
}

export interface StepState {
  level: Level;
  status: GameStatus;
  turnCount: number;   // number of turns taken (soul cycles are free, not counted)
}

// Replay a sequence of moves from a fresh level, returning the resulting state.
// Used identically by the recorder (derive current state from captured moves) and
// the player (derive state from moves.slice(0, step)) so the two never disagree.
// Moves after a clear/gameover are ignored, matching the live simulator.
export function playMoves(startLevel: Level, moves: SolutionMove[]): StepState {
  let level = cloneLevel(startLevel);
  let status: GameStatus = 'playing';
  let turnCount = 0;
  for (const m of moves) {
    if (status !== 'playing') break;
    if (m === 'soul') {
      // Soul cycle is a free action — no turn, may clear if the soul lands on goal.
      const next = cycleSoul(level);
      if (next) {
        level = next;
        if (isLevelCleared(level)) status = 'cleared';
      }
      continue;
    }
    const res = m === 'wait' ? executeSkipTurn(level) : executeTurn(level, m as Direction);
    level = res.level;
    status = res.status;
    turnCount += 1;
  }
  return { level, status, turnCount };
}
