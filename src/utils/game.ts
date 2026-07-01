import type { Level, GameState } from '../types';
import { cloneLevel } from './level';
import { recalcShadows } from '../engine/shadow';
import { decodeLevelCode } from './levelCode';

// Build a fresh playable GameState from an editor Level (mirrors the v2 App's
// startSimulation): clone, then recompute shadows if the level uses them.
export function newGameState(level: Level): GameState {
  const simLevel = cloneLevel(level);
  if (simLevel.hasShadow) recalcShadows(simLevel);
  return { level: simLevel, status: 'playing', turnCount: 0, history: [] };
}

// Decode a shared map code into a playable GameState. Returns null on bad codes.
export function gameStateFromCode(code: string): GameState | null {
  const level = decodeLevelCode(code.trim());
  if (!level) return null;
  return newGameState(level);
}
