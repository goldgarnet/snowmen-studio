import { useEffect, useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { GameState, Direction } from '../../types';
import { executeTurn, executeSkipTurn, cycleSoul, isLevelCleared, type TurnResult } from '../../engine/turn';
import {
  ANIMATION_SPEED_STEP,
  DEFAULT_ANIMATION_SPEED,
  MAX_ANIMATION_SPEED,
  MIN_ANIMATION_SPEED,
  animationFrameDelayMs,
  animationMovementDurationMs,
} from '../../utils/animation';
import Grid from './Grid';
import './Simulator.css';

interface SimulatorProps {
  gameState: GameState;
  setGameState: (gs: GameState) => void;
  onBack?: () => void;
  backLabel?: string;
  title?: string;
}

interface ActivePlayback {
  result: TurnResult;
  history: GameState['history'];
  turnCount: number;
}

interface TouchStart {
  pointerId: number;
  x: number;
  y: number;
  at: number;
}

export default function Simulator({ gameState, setGameState, onBack, backLabel = '나가기', title }: SimulatorProps) {
  // Keep the existing immediate-play behavior until the player opts in.
  const [animationEnabled, setAnimationEnabled] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(DEFAULT_ANIMATION_SPEED);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationSpeedRef = useRef(animationSpeed);
  const playbackTimerRef = useRef<number | null>(null);
  const playbackIdRef = useRef(0);
  const activePlaybackRef = useRef<ActivePlayback | null>(null);
  const touchStartRef = useRef<TouchStart | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(null);

  useEffect(() => () => {
    playbackIdRef.current += 1;
    activePlaybackRef.current = null;
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
  }, []);

  const finishPlaybackNow = useCallback(() => {
    const playback = activePlaybackRef.current;
    if (!playback) return;

    // Invalidate queued frame callbacks before showing the engine's already-computed
    // terminal state. The input remains one turn with one undo snapshot.
    playbackIdRef.current += 1;
    activePlaybackRef.current = null;
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setGameState({
      level: playback.result.level,
      status: playback.result.status,
      turnCount: playback.turnCount,
      history: playback.history,
    });
    setIsAnimating(false);
  }, [setGameState]);

  const playFrames = useCallback((result: TurnResult, history: GameState['history'], turnCount: number) => {
    if (playbackTimerRef.current !== null) window.clearTimeout(playbackTimerRef.current);
    const playbackId = playbackIdRef.current + 1;
    playbackIdRef.current = playbackId;
    activePlaybackRef.current = { result, history, turnCount };
    setIsAnimating(true);

    let frameIndex = 0;
    const showNextFrame = () => {
      if (playbackId !== playbackIdRef.current) return;

      const frame = result.frames[frameIndex];
      const isLastFrame = frameIndex === result.frames.length - 1;
      setGameState({
        level: frame.level,
        status: isLastFrame ? result.status : 'playing',
        turnCount,
        history,
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
  }, [setGameState]);

  useEffect(() => {
    animationSpeedRef.current = animationSpeed;
  }, [animationSpeed]);

  const handleAnimationToggle = useCallback((enabled: boolean) => {
    setAnimationEnabled(enabled);
    if (!enabled) finishPlaybackNow();
  }, [finishPlaybackNow]);

  const commitTurnResult = useCallback((result: TurnResult) => {
    const history = [...gameState.history, gameState.level];
    const turnCount = gameState.turnCount + 1;
    const hasMovement = result.frames.some(frame => frame.phase === 'movement');

    if (animationEnabled && hasMovement) {
      playFrames(result, history, turnCount);
      return;
    }

    setGameState({ level: result.level, status: result.status, turnCount, history });
  }, [animationEnabled, gameState, playFrames, setGameState]);

  const handleMove = useCallback((dir: Direction) => {
    if (gameState.status !== 'playing' || isAnimating) return;
    commitTurnResult(executeTurn(gameState.level, dir));
  }, [commitTurnResult, gameState.level, gameState.status, isAnimating]);

  const handleSkip = useCallback(() => {
    if (gameState.status !== 'playing' || isAnimating) return;
    commitTurnResult(executeSkipTurn(gameState.level));
  }, [commitTurnResult, gameState.level, gameState.status, isAnimating]);

  const handleUndo = useCallback(() => {
    if (isAnimating || gameState.history.length === 0) return;
    const newHistory = [...gameState.history];
    const prevLevel = newHistory.pop()!;
    setGameState({
      level: prevLevel,
      status: 'playing',
      turnCount: gameState.turnCount - 1,
      history: newHistory,
    });
  }, [gameState, isAnimating, setGameState]);

  const handleReset = useCallback(() => {
    if (isAnimating || gameState.history.length === 0) return;
    setGameState({
      level: gameState.history[0],
      status: 'playing',
      turnCount: 0,
      history: [],
    });
  }, [gameState, isAnimating, setGameState]);

  // M key: cycle the soul to the next snowman. A free action — does not advance the
  // turn (no melting/laser). To clear via a possessed snowman on the goal, end a turn.
  const handleSoulCycle = useCallback(() => {
    if (gameState.status !== 'playing' || isAnimating) return;
    if (!gameState.level.soulSwapEnabled) return;
    const newLevel = cycleSoul(gameState.level);
    if (!newLevel) return;
    // Soul cycle is a free action (no turn), but if the soul lands on the goal
    // the level should clear immediately.
    const status = isLevelCleared(newLevel) ? 'cleared' : gameState.status;
    setGameState({ ...gameState, level: newLevel, status });
  }, [gameState, isAnimating, setGameState]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': handleMove('up'); break;
        case 'ArrowDown': case 's': case 'S': handleMove('down'); break;
        case 'ArrowLeft': case 'a': case 'A': handleMove('left'); break;
        case 'ArrowRight': case 'd': case 'D': handleMove('right'); break;
        case ' ': e.preventDefault(); handleSkip(); break;
        case 'z': case 'Z': handleUndo(); break;
        case 'r': case 'R': handleReset(); break;
        case 'm': case 'M': handleSoulCycle(); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleMove, handleSkip, handleUndo, handleReset, handleSoulCycle]);

  const disabled = gameState.status !== 'playing' || isAnimating;

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
      handleMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      lastTapRef.current = null;
      return;
    }

    const previousTap = lastTapRef.current;
    const isDoubleTap = previousTap
      && event.timeStamp - previousTap.at <= 320
      && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 32;
    if (isDoubleTap) {
      lastTapRef.current = null;
      handleSkip();
    } else {
      lastTapRef.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    }
  }, [handleMove, handleSkip]);

  const cancelTouch = useCallback(() => { touchStartRef.current = null; }, []);

  return (
    <div className="simulator">
      <div className="sim-topbar">
        {onBack && (
          <button className="btn btn-ghost sim-back" onClick={onBack}>← {backLabel}</button>
        )}
        {title != null && <span className="sim-title">{title}</span>}
        <div className="sim-controls">
          <span className="sim-info">턴 {gameState.turnCount}</span>
          <label className={`sim-animation-toggle ${animationEnabled ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={animationEnabled}
              onChange={(event) => handleAnimationToggle(event.target.checked)}
            />
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
          <button onClick={handleSkip} disabled={disabled}>
            대기 (Space)
          </button>
          <button onClick={handleUndo} disabled={isAnimating || gameState.history.length === 0}>
            되돌리기 (Z)
          </button>
          <button onClick={handleReset} disabled={isAnimating || gameState.history.length === 0}>
            초기화 (R)
          </button>
        </div>
      </div>

      {gameState.level.soulSwapEnabled && (
        <div className="sim-notice">🌀 영혼 이동(M) 키를 사용할 수 있는 맵입니다.</div>
      )}

      <div className="sim-body">
        <div
          className="sim-grid-area"
          onPointerDown={handleTouchStart}
          onPointerUp={handleTouchEnd}
          onPointerCancel={cancelTouch}>
          <Grid
            level={gameState.level}
            highlightPlayer
            animateObjects={isAnimating && animationEnabled}
            animationDurationMs={animationMovementDurationMs(animationSpeed)}
          />
        </div>

        <div className="sim-touch-pad">
          <p className="sim-swipe-hint">스와이프하여 이동 · 두 번 탭하여 대기</p>
          <div className="dpad">
            <button className="dpad-btn dpad-up" onClick={() => handleMove('up')} disabled={disabled} aria-label="위">▲</button>
            <button className="dpad-btn dpad-left" onClick={() => handleMove('left')} disabled={disabled} aria-label="왼쪽">◀</button>
            <button className="dpad-btn dpad-center" onClick={handleSkip} disabled={disabled} aria-label="대기">⏸</button>
            <button className="dpad-btn dpad-right" onClick={() => handleMove('right')} disabled={disabled} aria-label="오른쪽">▶</button>
            <button className="dpad-btn dpad-down" onClick={() => handleMove('down')} disabled={disabled} aria-label="아래">▼</button>
          </div>
          <div className="dpad-aux">
            {gameState.level.soulSwapEnabled && (
              <button onClick={handleSoulCycle} disabled={disabled}>🌀 영혼이동 (M)</button>
            )}
            <button onClick={handleUndo} disabled={isAnimating || gameState.history.length === 0}>↩ 되돌리기</button>
            <button onClick={handleReset} disabled={isAnimating || gameState.history.length === 0}>⟳ 초기화</button>
          </div>
        </div>
      </div>

      {gameState.status === 'cleared' && (
        <div className="overlay cleared">
          <div className="overlay-content">
            <h2>클리어!</h2>
            <p>턴 수: {gameState.turnCount}</p>
            <button onClick={handleUndo}>되돌리기</button>
            <button onClick={handleReset}>다시 시작</button>
          </div>
        </div>
      )}

      {gameState.status === 'gameover' && (
        <div className="overlay gameover">
          <div className="overlay-content">
            <h2>게임 오버</h2>
            <button onClick={handleUndo}>되돌리기</button>
            <button onClick={handleReset}>다시 시작</button>
          </div>
        </div>
      )}
    </div>
  );
}
