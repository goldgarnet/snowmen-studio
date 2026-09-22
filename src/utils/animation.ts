export const DEFAULT_ANIMATION_SPEED = 1;
export const MIN_ANIMATION_SPEED = 0.1;
export const MAX_ANIMATION_SPEED = 5;
export const ANIMATION_SPEED_STEP = 0.1;

const BASE_FRAME_DELAY_MS = {
  movement: 150,
  impact: 80,
} as const;

export type AnimationFramePhase = keyof typeof BASE_FRAME_DELAY_MS | 'resolved' | 'turn-end';

export function animationFrameDelayMs(phase: AnimationFramePhase, speed: number): number {
  const base = BASE_FRAME_DELAY_MS[phase as keyof typeof BASE_FRAME_DELAY_MS] ?? 0;
  return Math.round(base / Math.max(speed, 0.01));
}

export function animationMovementDurationMs(speed: number): number {
  return animationFrameDelayMs('movement', speed);
}
