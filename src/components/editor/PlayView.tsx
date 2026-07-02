import { useState } from 'react';
import type { GameState } from '../../types';
import { gameStateFromCode } from '../../utils/game';
import Simulator from './Simulator';
import './PlayView.css';

interface PlayViewProps {
  code: string;
  title?: string;
  // Label for the back button (rendered as "← {backLabel}"). Studio passes
  // "에디터로"; the hub keeps the default "나가기".
  backLabel?: string;
  onClose: () => void;
}

// Standalone play surface: decodes a map code and runs the Simulator. Used both
// for test-playing a map you're editing and for playing a hub map. The Simulator
// renders the single top bar (back + title on the left, turn/controls on the right).
export default function PlayView({ code, title, backLabel = '나가기', onClose }: PlayViewProps) {
  const [gameState, setGameState] = useState<GameState | null>(() => gameStateFromCode(code));

  return (
    <div className="play-view">
      {gameState ? (
        <Simulator
          gameState={gameState}
          setGameState={setGameState}
          onBack={onClose}
          backLabel={backLabel}
          title={title || '플레이'}
        />
      ) : (
        <>
          <div className="play-view-bar">
            <button className="btn btn-ghost" onClick={onClose}>← {backLabel}</button>
            <span className="play-view-title">{title || '플레이'}</span>
          </div>
          <div className="play-view-error">맵 코드를 해석할 수 없습니다. 코드가 올바른지 확인하세요.</div>
        </>
      )}
    </div>
  );
}
