import { useState, useMemo, useCallback, useEffect } from 'react';
import { gameStateFromCode } from '../../utils/game';
import { playMoves, encodeSolution, decodeSolution, SolutionMove } from '../../utils/solution';
import Grid from '../editor/Grid';
import '../editor/Simulator.css';
import '../editor/PlayView.css';

interface SolutionRecorderProps {
  code: string;
  initial?: string | null;          // existing solution to start from (수정 시)
  onSave: (moves: string, turnCount: number) => Promise<void>;
  onCancel: () => void;
  // 'record' (기본): 대놓고 풀이를 만드는 화면. 상단에 저장 버튼 상시 노출.
  // 'play': "바로 플레이"에서 진입 — 그냥 플레이하다가 클리어하면 아래 배너로 등록 유도.
  variant?: 'record' | 'play';
  title?: string;
}

// Records a 풀이 by letting the owner play the map. Every action is captured into a
// move list; state is always re-derived from that list via playMoves so undo (pop)
// and reset (clear) stay perfectly in sync. Saving is only allowed once the played
// sequence actually clears the map, guaranteeing viewers see a real solution.
export default function SolutionRecorder({
  code, initial, onSave, onCancel, variant = 'record', title,
}: SolutionRecorderProps) {
  const isPlay = variant === 'play';
  const heading = title ?? (isPlay ? '바로 플레이' : '풀이 녹화');
  const startLevel = useMemo(() => gameStateFromCode(code)?.level ?? null, [code]);
  const [moves, setMoves] = useState<SolutionMove[]>(() =>
    (initial ? decodeSolution(initial) : null) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = useMemo(
    () => (startLevel ? playMoves(startLevel, moves) : null),
    [startLevel, moves],
  );

  const playing = state?.status === 'playing';
  const cleared = state?.status === 'cleared';
  const soulEnabled = !!startLevel?.soulSwapEnabled;

  const push = useCallback((m: SolutionMove) => {
    setError(null);
    setMoves((prev) => {
      const s = playMoves(startLevel!, prev);
      if (s.status !== 'playing') return prev;      // no input once cleared / game over
      return [...prev, m];
    });
  }, [startLevel]);

  const undo = useCallback(() => { setMoves((prev) => prev.slice(0, -1)); }, []);
  const reset = useCallback(() => { setMoves([]); }, []);

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
      await onSave(encodeSolution(moves), state?.turnCount ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      setSaving(false);
    }
  };

  if (!startLevel || !state) {
    return (
      <div className="play-view">
        <div className="play-view-bar">
          <button className="btn btn-ghost" onClick={onCancel}>← 상세로</button>
          <span className="play-view-title">풀이 녹화</span>
        </div>
        <div className="play-view-error">맵 코드를 해석할 수 없어 풀이를 녹화할 수 없습니다.</div>
      </div>
    );
  }

  const disabled = !playing || saving;

  return (
    <div className="play-view">
      <div className="simulator">
        <div className="sim-topbar">
          <button className="btn btn-ghost sim-back" onClick={onCancel} disabled={saving}>← 상세로</button>
          <span className="sim-title">{heading}</span>
          <div className="sim-controls">
            <span className="sim-info">턴 {state.turnCount} · 입력 {moves.length}</span>
            <button onClick={undo} disabled={moves.length === 0 || saving}>되돌리기 (Z)</button>
            <button onClick={reset} disabled={moves.length === 0 || saving}>초기화 (R)</button>
            {!isPlay && (
              <button className="btn btn-primary" onClick={save} disabled={!cleared || saving}>
                {saving ? '저장 중…' : '이 풀이 저장'}
              </button>
            )}
          </div>
        </div>

        {/* Play 모드에서 클리어하면 등록 유도 배너를, 그 외엔 상황 안내를 보여준다. */}
        {isPlay && cleared ? (
          <div className="sim-notice" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>🎉 클리어! 원하면 이 플레이를 <b>내 풀이</b>로 등록할 수 있어요. (턴 {state.turnCount})</span>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? '등록 중…' : '이 풀이로 등록'}
            </button>
          </div>
        ) : (
          <div className="sim-notice">
            {cleared
              ? '✅ 맵을 클리어했습니다. “이 풀이 저장”을 누르면 등록됩니다.'
              : state.status === 'gameover'
                ? '💀 게임 오버 — 되돌리기(Z)나 초기화(R)로 다시 시도하세요.'
                : isPlay
                  ? '맵을 플레이하세요. 클리어하면 이 풀이를 등록할 수 있어요.'
                  : '맵을 직접 플레이해 풀이를 녹화하세요. 클리어하면 저장할 수 있습니다.'}
            {soulEnabled && ' · 🌀 영혼 이동(M) 사용 가능'}
          </div>
        )}

        {error && <div className="play-view-error" style={{ padding: '8px 22px' }}>{error}</div>}

        <div className="sim-body">
          <div className="sim-grid-area">
            <Grid level={state.level} highlightPlayer />
          </div>

          <div className="sim-touch-pad">
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
              <button onClick={undo} disabled={moves.length === 0 || saving}>↩ 되돌리기</button>
              <button onClick={reset} disabled={moves.length === 0 || saving}>⟳ 초기화</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
