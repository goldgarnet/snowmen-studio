import type { Level, GameState } from '../types';
import { cloneLevel } from './level';
import { recalcShadows } from '../engine/shadow';
import { applyTurnZero } from '../engine/turn';
import { decodeLevelCode } from './levelCode';

// Build a fresh playable GameState from an editor Level (mirrors the v2 App's
// startSimulation): clone, recompute shadows if the level uses them, then resolve
// "turn 0" — lasers already fire at the start, so snow placed in a beam melts at once
// (Q-07). Every play screen starts here, so recordings and playback agree.
export function newGameState(level: Level): GameState {
  const simLevel = cloneLevel(level);
  if (simLevel.hasShadow) recalcShadows(simLevel);
  const status = applyTurnZero(simLevel);
  return { level: simLevel, status, turnCount: 0, history: [] };
}

// Decode a shared map code into a playable GameState. Returns null on bad codes.
export function gameStateFromCode(code: string): GameState | null {
  const level = decodeLevelCode(code.trim());
  if (!level) return null;
  return newGameState(level);
}
