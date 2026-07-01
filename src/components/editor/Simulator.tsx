import { useEffect, useCallback } from 'react';
import { GameState, Direction } from '../../types';
import { cloneLevel } from '../../utils/level';
import { executeTurn, executeSkipTurn, cycleSoul } from '../../engine/turn';
import Grid from './Grid';
import './Simulator.css';

interface SimulatorProps {
  gameState: GameState;
  setGameState: (gs: GameState) => void;
}

export default function Simulator({ gameState, setGameState }: SimulatorProps) {
  const handleMove = useCallback((dir: Direction) => {
    if (gameState.status !== 'playing') return;

    const prevLevel = cloneLevel(gameState.level);
    const result = executeTurn(gameState.level, dir);

    setGameState({
      level: result.level,
      status: result.status,
      turnCount: gameState.turnCount + 1,
      history: [...gameState.history, prevLevel],
    });
  }, [gameState, setGameState]);

  const handleSkip = useCallback(() => {
    if (gameState.status !== 'playing') return;

    const prevLevel = cloneLevel(gameState.level);
    const result = executeSkipTurn(gameState.level);

    setGameState({
      level: result.level,
      status: result.status,
      turnCount: gameState.turnCount + 1,
      history: [...gameState.history, prevLevel],
    });
  }, [gameState, setGameState]);

  const handleUndo = useCallback(() => {
    if (gameState.history.length === 0) return;
    const newHistory = [...gameState.history];
    const prevLevel = newHistory.pop()!;
    setGameState({
      level: prevLevel,
      status: 'playing',
      turnCount: gameState.turnCount - 1,
      history: newHistory,
    });
  }, [gameState, setGameState]);

  const handleReset = useCallback(() => {
    if (gameState.history.length === 0) return;
    setGameState({
      level: cloneLevel(gameState.history[0]),
      status: 'playing',
      turnCount: 0,
      history: [],
    });
  }, [gameState, setGameState]);

  // M key: cycle the soul to the next snowman. A free action — does not advance the
  // turn (no melting/laser). To clear via a possessed snowman on the goal, end a turn.
  const handleSoulCycle = useCallback(() => {
    if (gameState.status !== 'playing') return;
    if (!gameState.level.soulSwapEnabled) return;
    const newLevel = cycleSoul(gameState.level);
    if (!newLevel) return;
    setGameState({ ...gameState, level: newLevel });
  }, [gameState, setGameState]);

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

  const disabled = gameState.status !== 'playing';

  return (
    <div className="simulator">
      <div className="sim-controls">
        <span className="sim-info">턴: {gameState.turnCount}</span>
        <button onClick={handleSkip} disabled={disabled}>
          대기 (Space)
        </button>
        <button onClick={handleUndo} disabled={gameState.history.length === 0}>
          되돌리기 (Z)
        </button>
        <button onClick={handleReset} disabled={gameState.history.length === 0}>
          초기화 (R)
        </button>
      </div>

      <div className="sim-body">
        <div className="sim-grid-area">
          <Grid level={gameState.level} highlightPlayer />
        </div>

        <div className="sim-touch-pad">
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
            <button onClick={handleUndo} disabled={gameState.history.length === 0}>↩ 되돌리기</button>
            <button onClick={handleReset} disabled={gameState.history.length === 0}>⟳ 초기화</button>
          </div>
        </div>
      </div>

      <div className="sim-help">
        <span>방향키 / WASD: 이동</span>
        <span>Space: 대기 (턴 넘기기)</span>
        <span>Z: 되돌리기</span>
        <span>R: 초기화</span>
        {gameState.level.soulSwapEnabled && <span>M: 영혼 이동</span>}
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
