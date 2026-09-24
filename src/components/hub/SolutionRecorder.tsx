import { useState, useMemo, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { gameStateFromCode } from '../../utils/game';
import {
  advanceSolutionState,
  createSolutionState,
  encodeSolution,
  decodeSolution,
  SolutionMove,
  StepState,
} from '../../utils/solution';
import Grid from '../editor/Grid';
import {
  ANIMATION_SPEED_STEP,
  DEFAULT_ANIMATION_SPEED,
  MAX_ANIMATION_SPEED,
  MIN_ANIMATION_SPEED,
  animationFrameDelayMs,
  animationMovementDurationMs,
} from '../../utils/animation';
import '../editor/Simulator.css';
import '../editor/PlayView.css';

interface SolutionRecorderProps {
  code: string;
  initial?: string | null;          // existing solution to start from (수정 시)
  onSave: (moves: string, turnCount: number) => Promise<void>;
  onCancel: () => void;
  title?: string;
  backLabel?: string;
}

interface RecordingState {
  moves: SolutionMove[];
  // states[n] is the derived state after moves.slice(0, n). Keeping this timeline
  // makes both a new move and undo O(1) turns instead of replaying from move zero.
  states: StepState[];
}

interface ActivePlayback {
  finalState: StepState;
  frames: NonNullable<StepState['frames']>;
}

interface TouchStart {
  pointerId: number;
  x: number;
  y: number;
  at: number;
}

function createRecordingState(startLevel: NonNullable<ReturnType<typeof gameStateFromCode>>['level'], moves: SolutionMove[]): RecordingState {
  const states: StepState[] = [createSolutionState(startLevel)];
  for (const move of moves) {
    states.push(advanceSolutionState(states[states.length - 1], move));
  }
  return { moves, states };
}

// Records a 풀이 by letting the owner play the map. Every action is captured into a
// move list; each derived state is retained alongside it so undo/reset stay perfectly
// in sync without replaying the entire solution on every input. Saving is only allowed
// once the played sequence actually clears the map.
export default function SolutionRecorder({
  code, initial, onSave, onCancel, title, backLabel = '상세로',
}: SolutionRecorderProps) {
  const heading = title ?? '플레이';
  const startLevel = useMemo(() => gameStateFromCode(code)?.level ?? null, [code]);
  const initialMoves = useMemo(() => (initial ? decodeSolution(initial) : null) ?? [], [initial]);
  const initialRecording = useMemo<RecordingState>(() => (
    startLevel ? createRecordingState(startLevel, initialMoves) : { moves: initialMoves, states: [] }
  ), [initialMoves, startLevel]);
  const [recording, setRecording] = useState<RecordingState>(() => initialRecording);
  const [displayState, setDisplayState] = useState<StepState | null>(
    () => initialRecording.states[initialRecording.states.length - 1] ?? null,
  );
  const [animationEnabled, setAnimationEnabled] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(DEFAULT_ANIMATION_SPEED);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationSpeedRef = useRef(animationSpeed);
  const playbackTimerRef = useRef<number | null>(null);
  const playbackIdRef = useRef(0);
  const activePlaybackRef = useRef<ActivePlayback | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchStartRef = useRef<TouchStart | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(null);

  const moves = recording.moves;
  const recordedState = recording.states[recording.states.length - 1] ?? null;
  const state = displayState;

  const playing = state?.status === 'playing';
  const cleared = state?.status === 'cleared';
  const soulEnabled = !!startLevel?.soulSwapEnabled;

  useEffect(() => () => {
    playbackIdRef.current += 1;
    activePlaybackRef.current = null;
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
  }, []);

  const finishPlaybackNow = useCallback(() => {
    const playback = activePlaybackRef.current;
    if (!playback) return;
    playbackIdRef.current += 1;
    activePlaybackRef.current = null;
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setDisplayState(playback.finalState);
    setIsAnimating(false);
  }, []);

  const playFrames = useCallback((nextState: StepState, frames: NonNullable<StepState['frames']>) => {
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    const playbackId = playbackIdRef.current + 1;
    playbackIdRef.current = playbackId;
    activePlaybackRef.current = { finalState: nextState, frames };
    setIsAnimating(true);

    let frameIndex = 0;
    const showNextFrame = () => {
      if (playbackId !== playbackIdRef.current) return;
      const frame = frames[frameIndex];
      const isLastFrame = frameIndex === frames.length - 1;
      setDisplayState({
        level: frame.level,
        status: isLastFrame ? nextState.status : 'playing',
        turnCount: nextState.turnCount,
      });

      if (isLastFrame) {
        playbackTimerRef.current = null;
        activePlaybackRef.current = null;
        setIsAnimating(false);
        return;
      }

      const delay = animationFrameDelayMs(frame.phase, animationSpeedRef.current);
      frameIndex += 1;
      playbackTimerRef.current = window.setTimeout(showNextFrame, delay);
    };

    showNextFrame();
  }, []);

  useEffect(() => {
    animationSpeedRef.current = animationSpeed;
  }, [animationSpeed]);

  const handleAnimationToggle = useCallback((enabled: boolean) => {
    setAnimationEnabled(enabled);
    if (!enabled) finishPlaybackNow();
  }, [finishPlaybackNow]);

  const push = useCallback((m: SolutionMove) => {
    if (!recordedState || recordedState.status !== 'playing' || isAnimating) return;
    setError(null);
    const animatedState = advanceSolutionState(recordedState, m, true);
    const nextState: StepState = {
      level: animatedState.level,
      status: animatedState.status,
      turnCount: animatedState.turnCount,
    };
    setRecording((prev) => ({ moves: [...prev.moves, m], states: [...prev.states, nextState] }));

    const frames = animatedState.frames ?? [];
    if (animationEnabled && frames.some(frame => frame.phase === 'movement')) {
      playFrames(nextState, frames);
    } else {
      setDisplayState(nextState);
    }
  }, [animationEnabled, isAnimating, playFrames, recordedState]);

  const undo = useCallback(() => {
    if (isAnimating || recording.moves.length === 0) return;
    const states = recording.states.slice(0, -1);
    setRecording({ moves: recording.moves.slice(0, -1), states });
    setDisplayState(states[states.length - 1] ?? null);
  }, [isAnimating, recording]);
  const reset = useCallback(() => {
    if (isAnimating || recording.moves.length === 0) return;
    const states = recording.states.slice(0, 1);
    setRecording({ moves: [], states });
    setDisplayState(states[0] ?? null);
  }, [isAnimating, recording]);

  useEffect(() => {
    if (!startLevel) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': push('up'); break;
        case 'ArrowDown': case 's': case 'S': push('down'); break;
        case 'ArrowLeft': case 'a': case 'A': push('left'); break;
        case 'ArrowRight': case 'd': case 'D': push('right'); break;
        case ' ': e.preventDefault(); push('wait'); break;
        case 'z': case 'Z': undo(); break;
        case 'r': case 'R': reset(); break;
        case 'm': case 'M': if (soulEnabled) push('soul'); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startLevel, soulEnabled, push, undo, reset]);

  const save = async () => {
    if (!cleared) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(encodeSolution(moves), recordedState?.turnCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      setSaving(false);
    }
  };

  const disabled = !playing || saving || isAnimating;

  const handleTouchStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    touchStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp };
  }, [disabled]);

  const handleTouchEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (event.pointerType !== 'touch' || !start || start.pointerId !== event.pointerId) return;
    touchStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 28) {
      push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      lastTapRef.current = null;
      return;
    }

    const previousTap = lastTapRef.current;
    const isDoubleTap = previousTap
      && event.timeStamp - previousTap.at <= 320
      && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 32;
    if (isDoubleTap) {
      lastTapRef.current = null;
      push('wait');
    } else {
      lastTapRef.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    }
  }, [push]);

  const cancelTouch = useCallback(() => { touchStartRef.current = null; }, []);

  if (!startLevel || !state) {
    return (
      <div className="play-view">
        <div className="play-view-bar">
          <button className="btn btn-ghost" onClick={onCancel}>← {backLabel}</button>
          <span className="play-view-title">플레이</span>
        </div>
        <div className="play-view-error">맵 코드를 해석할 수 없어 플레이할 수 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="play-view">
      <div className="simulator">
        <div className="sim-topbar">
          <button className="btn btn-ghost sim-back" onClick={onCancel} disabled={saving}>← {backLabel}</button>
          <span className="sim-title">{heading}</span>
          <div className="sim-controls">
            <span className="sim-info">턴 {state.turnCount} · 입력 {moves.length}</span>
            <label className={`sim-animation-toggle ${animationEnabled ? 'is-on' : ''}`}>
              <input type="checkbox" checked={animationEnabled} onChange={(event) => handleAnimationToggle(event.target.checked)} />
              <span>이동 애니메이션</span>
            </label>
            {animationEnabled && (
              <label className="sim-animation-speed">
                <span>속도</span>
                <input
                  type="range"
                  min={MIN_ANIMATION_SPEED}
                  max={MAX_ANIMATION_SPEED}
                  step={ANIMATION_SPEED_STEP}
                  value={animationSpeed}
                  onChange={(event) => setAnimationSpeed(Number(event.target.value))}
                  aria-label="이동 애니메이션 속도"
                />
                <output>{animationSpeed.toFixed(2).replace(/\.00$/, '')}배</output>
              </label>
            )}
            <button onClick={undo} disabled={moves.length === 0 || saving || isAnimating}>되돌리기 (Z)</button>
            <button onClick={reset} disabled={moves.length === 0 || saving || isAnimating}>초기화 (R)</button>
            <button className="btn btn-primary" onClick={save} disabled={!cleared || saving}>
              {saving ? '등록 중…' : '풀이 등록'}
            </button>
          </div>
        </div>

        <div className="sim-notice">
          {cleared
            ? '✅ 맵을 클리어했습니다. “풀이 등록”을 누르면 이 플레이가 저장됩니다.'
            : state.status === 'gameover'
              ? '💀 게임 오버 — 되돌리기(Z)나 초기화(R)로 다시 시도하세요.'
              : '맵을 플레이하세요. 클리어하면 이 플레이를 풀이로 등록할 수 있어요.'}
          {soulEnabled && ' · 🌀 영혼 이동(M) 사용 가능'}
        </div>

        {error && <div className="play-view-error" style={{ padding: '8px 22px' }}>{error}</div>}

        <div className="sim-body">
          <div
            className="sim-grid-area"
            onPointerDown={handleTouchStart}
            onPointerUp={handleTouchEnd}
            onPointerCancel={cancelTouch}>
            <Grid level={state.level} highlightPlayer animateObjects={isAnimating && animationEnabled} animationDurationMs={animationMovementDurationMs(animationSpeed)} />
          </div>

          <div className="sim-touch-pad">
            <p className="sim-swipe-hint">스와이프하여 이동 · 두 번 탭하여 대기</p>
            <div className="dpad">
              <button className="dpad-btn dpad-up" onClick={() => push('up')} disabled={disabled} aria-label="위">▲</button>
              <button className="dpad-btn dpad-left" onClick={() => push('left')} disabled={disabled} aria-label="왼쪽">◀</button>
              <button className="dpad-btn dpad-center" onClick={() => push('wait')} disabled={disabled} aria-label="대기">⏸</button>
              <button className="dpad-btn dpad-right" onClick={() => push('right')} disabled={disabled} aria-label="오른쪽">▶</button>
              <button className="dpad-btn dpad-down" onClick={() => push('down')} disabled={disabled} aria-label="아래">▼</button>
            </div>
            <div className="dpad-aux">
              {soulEnabled && (
                <button onClick={() => push('soul')} disabled={disabled}>🌀 영혼이동 (M)</button>
              )}
              <button onClick={undo} disabled={moves.length === 0 || saving || isAnimating}>↩ 되돌리기</button>
              <button onClick={reset} disabled={moves.length === 0 || saving || isAnimating}>⟳ 초기화</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
