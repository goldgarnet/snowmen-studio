import { useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { formatTime, seekRatio } from '../../lib/music';

// 곡 한 줄의 파형 = 재생 위치 막대. 누르거나 끌면 그 자리로, ←/→ 는 5초씩.
// 파형이 없는 곡(브라우저가 못 읽은 파일)은 가는 막대 하나로 그린다.

const BAR_W = 2;
const BAR_STEP = 3;   // 막대 + 틈

function wavePath(peaks: readonly number[] | null): { d: string; width: number } {
  if (!peaks || peaks.length === 0) return { d: 'M0 42h300v16h-300z', width: 300 };
  let d = '';
  peaks.forEach((p, i) => {
    const h = Math.max(6, Math.min(100, p * 100));
    d += `M${i * BAR_STEP} ${((100 - h) / 2).toFixed(1)}h${BAR_W}v${h.toFixed(1)}h-${BAR_W}z`;
  });
  return { d, width: peaks.length * BAR_STEP - (BAR_STEP - BAR_W) };
}

export interface WaveMark {
  id: string;
  at: number;
  ratio: number;
  label: string;
}

interface WaveformProps {
  peaks: number[] | null;
  duration: number;      // 모르면 0
  time: number;          // 지금 곡이 아니면 0
  active: boolean;       // 지금 곡인가
  label: string;         // 화면 읽기용 곡 이름
  marks?: WaveMark[];
  compact?: boolean;
  onSeek: (ratio: number) => void;
  onMark?: (at: number) => void;
}

export default function Waveform({ peaks, duration, time, active, label, marks = [], compact, onSeek, onMark }: WaveformProps) {
  const { d, width } = useMemo(() => wavePath(peaks), [peaks]);
  const dragging = useRef(false);
  const progress = active && duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;

  const ratioAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return seekRatio(e.clientX, box.left, box.width);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    onSeek(ratioAt(e));
    // 지금 곡이면 누른 채 끌어 위치를 옮긴다(다른 곡은 한 번 누르면 그 자리부터 재생).
    if (active) {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onSeek(ratioAt(e));
  };
  const endDrag = () => { dragging.current = false; };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(duration > 0)) return;
    const now = active ? time : 0;
    const to = e.key === 'ArrowRight' ? now + 5 : e.key === 'ArrowLeft' ? now - 5
      : e.key === 'Home' ? 0 : e.key === 'End' ? duration - 1 : null;
    if (to == null) return;
    e.preventDefault();
    e.stopPropagation();
    onSeek(Math.min(1, Math.max(0, to / duration)));
  };

  return (
    <div className={`music-wave-wrap${compact ? ' compact' : ''}`}>
      <div
        className={`music-wave${active ? ' active' : ''}${peaks ? '' : ' flat'}`}
        role="slider"
        tabIndex={0}
        aria-label={`${label} 재생 위치`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(progress * duration)}
        aria-valuetext={`${formatTime(progress * duration)} / ${formatTime(duration || null)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <svg className="music-wave-base" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" aria-hidden="true">
          <path d={d} />
        </svg>
        {active && (
          <svg
            className="music-wave-played"
            viewBox={`0 0 ${width} 100`}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ clipPath: `inset(0 ${(100 - progress * 100).toFixed(2)}% 0 0)` }}
          >
            <path d={d} />
          </svg>
        )}
        {active && <span className="music-wave-head" style={{ left: `${(progress * 100).toFixed(2)}%` }} aria-hidden="true" />}
      </div>
      {marks.map((m) => (
        <button
          key={m.id}
          type="button"
          className="music-wave-mark"
          style={{ left: `${(m.ratio * 100).toFixed(2)}%` }}
          title={m.label}
          aria-label={`${formatTime(m.at)} 피드백 지점부터 듣기`}
          onClick={() => onMark?.(m.at)}
        />
      ))}
    </div>
  );
}
