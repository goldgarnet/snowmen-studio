import { useState, useMemo, useEffect, useCallback } from 'react';
import { gameStateFromCode } from '../../utils/game';
import { playMoves, decodeSolution, MOVE_LABEL, SolutionMove } from '../../utils/solution';
import Grid from '../editor/Grid';
import '../editor/Simulator.css';
import '../editor/PlayView.css';

interface SolutionPlayerProps {
  code: string;
  solution: string;
  title?: string;
  onClose: () => void;
}

const AUTOPLAY_MS = 650;

// Replays a stored 풀이 step by step. State at any step is derived from
// playMoves(startLevel, moves.slice(0, step)) — the same derivation the recorder
// uses — so the playback matches exactly how the solution was recorded.
export default function SolutionPlayer({ code, solution, title, onClose }: SolutionPlayerProps) {
  const startLevel = useMemo(() => gameStateFromCode(code)?.level ?? null, [code]);
  const moves = useMemo<SolutionMove[] | null>(() => decodeSolution(solution), [solution]);
  const total = moves?.length ?? 0;

  const [step, setStep] = useState(0); // number of moves applied so far
  const [auto, setAuto] = useState(false);

  const state = useMemo(
    () => (startLevel && moves ? playMoves(startLevel, moves.slice(0, step)) : null),
    [startLevel, moves, step],
  );

  const atEnd = step >= total;
  const lastMove = step > 0 && moves ? moves[step - 1] : null;

  const goNext = useCallback(() => setStep((s) => Math.min(total, s + 1)), [total]);
  const goPrev = useCallback(() => { setAuto(false); setStep((s) => Math.max(0, s - 1)); }, []);
  const goFirst = useCallback(() => { setAuto(false); setStep(0); }, []);
  const goLast = useCallback(() => { setAuto(false); setStep(total); }, [total]);

  // Auto-play advances one step per tick until the end. Uses a self-rescheduling
  // timeout (the effect re-runs on each step change) and stops once it lands on the
  // final step; setState inside the async callback is fine (unlike in the effect body).
  useEffect(() => {
    if (!auto || step >= total) return;
    const id = setTimeout(() => {
      setStep((s) => Math.min(total, s + 1));
      if (step + 1 >= total) setAuto(false);
    }, AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [auto, step, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight': case 'd': case 'D': setAuto(false); goNext(); break;
        case 'ArrowLeft': case 'a': case 'A': goPrev(); break;
        case ' ': e.preventDefault(); setAuto((a) => !a); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  if (!startLevel || !moves || !state) {
    return (
      <div className="play-view">
        <div className="play-view-bar">
          <button className="btn btn-ghost" onClick={onClose}>← 상세로</button>
          <span className="play-view-title">풀이 보기</span>
        </div>
        <div className="play-view-error">풀이를 재생할 수 없습니다. 맵 코드나 풀이 데이터가 손상되었을 수 있습니다.</div>
      </div>
    );
  }

  return (
    <div className="play-view">
      <div className="simulator">
        <div className="sim-topbar">
          <button className="btn btn-ghost sim-back" onClick={onClose}>← 상세로</button>
          <span className="sim-title">풀이 보기 · {title || '플레이'}</span>
          <div className="sim-controls">
            <span className="sim-info">
              {step}/{total} 스텝{lastMove ? ` · ${MOVE_LABEL[lastMove]}` : ''}
              {state.status === 'cleared' && ' · ✅ 클리어'}
            </span>
            <button onClick={goFirst} disabled={step === 0}>⏮ 처음</button>
            <button onClick={goPrev} disabled={step === 0}>◀ 이전</button>
            <button className="btn btn-primary" onClick={() => setAuto((a) => !a)} disabled={atEnd}>
              {auto ? '⏸ 정지' : '▶ 자동재생'}
            </button>
            <button onClick={() => { setAuto(false); goNext(); }} disabled={atEnd}>다음 ▶</button>
            <button onClick={goLast} disabled={atEnd}>끝 ⏭</button>
          </div>
        </div>

        <div className="sim-notice">
          {atEnd
            ? (state.status === 'cleared' ? '✅ 풀이 끝 — 맵을 클리어했습니다.' : '풀이 끝 지점입니다.')
            : '출제자가 등록한 풀이입니다. 스텝을 넘기며 확인하세요. (←/→, Space=재생)'}
        </div>

        <div className="sim-body">
          <div className="sim-grid-area">
            <Grid level={state.level} highlightPlayer />
          </div>
        </div>
      </div>
    </div>
  );
}
