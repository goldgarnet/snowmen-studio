import { decodeSolution, encodeSolution, type SolutionMove } from './solution';

const KEY_PREFIX = 'snowmen-studio:play-checkpoint:v1';

export interface PlayCheckpoint {
  moves: SolutionMove[];
  turnCount: number;
}

function storageKey(playerId: string, mapId: string | null): string {
  return `${KEY_PREFIX}:${playerId}:${mapId ?? 'new'}`;
}

export function readPlayCheckpoint(playerId: string, mapId: string | null, code: string): PlayCheckpoint | null {
  try {
    const raw = localStorage.getItem(storageKey(playerId, mapId));
    if (!raw) return null;
    const data = JSON.parse(raw) as { code?: unknown; moves?: unknown; turnCount?: unknown } | null;
    if (data?.code !== code || typeof data.moves !== 'string'
      || typeof data.turnCount !== 'number' || !Number.isSafeInteger(data.turnCount)
      || data.turnCount < 0) return null;
    const moves = decodeSolution(data.moves);
    return moves ? { moves, turnCount: data.turnCount } : null;
  } catch {
    return null;
  }
}

export function writePlayCheckpoint(
  playerId: string, mapId: string | null, code: string, checkpoint: PlayCheckpoint,
): boolean {
  try {
    localStorage.setItem(storageKey(playerId, mapId), JSON.stringify({
      code,
      moves: encodeSolution(checkpoint.moves),
      turnCount: checkpoint.turnCount,
    }));
    return true;
  } catch {
    return false;
  }
}
