import { useState } from 'react';
import type { GameState } from '../../types';
import { gameStateFromCode } from '../../utils/game';
import Simulator from './Simulator';
import './PlayView.css';

interface PlayViewProps {
  code: string;
  title?: string;
  onClose: () => void;
}

// Standalone play surface: decodes a map code and runs the Simulator. Used both
// for test-playing a map you're editing and for playing a hub map.
export default function PlayView({ code, title, onClose }: PlayViewProps) {
  const [gameState, setGameState] = useState<GameState | null>(() => gameStateFromCode(code));

  return (
    <div className="play-view">
      <div className="play-view-bar">
        <button className="btn btn-ghost" onClick={onClose}>← 나가기</button>
        <span className="play-view-title">{title || '플레이'}</span>
        <button
          className="btn"
          onClick={() => setGameState(gameStateFromCode(code))}
          disabled={!gameState}
        >
          ⟳ 처음부터
        </button>
      </div>
      {gameState ? (
        <Simulator gameState={gameState} setGameState={setGameState} />
      ) : (
        <div className="play-view-error">맵 코드를 해석할 수 없습니다. 코드가 올바른지 확인하세요.</div>
      )}
    </div>
  );
}
