import { formatTime } from '../../lib/music';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, Spinner, VolumeIcon } from './icons';
import { usePlayerTime, type MusicPlayer, type PlayerState, type PlayMode } from './player';

// 화면 아래에 떠 있는 재생 막대 — 곡을 튼 동안만 보인다. 다른 챕터를 보고 있어도 계속 들린다.

const MODES: { value: PlayMode; label: string; hint: string }[] = [
  { value: 'once', label: '한 곡', hint: '곡이 끝나면 멈춰요' },
  { value: 'loop', label: '반복', hint: '이 곡을 계속 반복해요 — 게임 배경음처럼 끝과 처음이 잘 이어지는지 들어 볼 때' },
  { value: 'continue', label: '이어 듣기', hint: '곡이 끝나면 목록의 다음 곡을 틀어요' },
];

export interface PlayerBarInfo {
  title: string;
  no: number;
  label: string;        // 칸 이름 (챕터 2 · 바위 지형)
  uploader: string;
}

interface MusicPlayerBarProps {
  player: MusicPlayer;
  state: PlayerState;
  info: PlayerBarInfo | null;
  onLocate: () => void;   // 곡 이름을 누르면 그 곡이 있는 칸으로
}

export default function MusicPlayerBar({ player, state, info, onLocate }: MusicPlayerBarProps) {
  const time = usePlayerTime(player, Boolean(state.currentId));
  if (!state.currentId || !info) return null;
  const duration = state.duration;

  return (
    <div className="music-bar" role="region" aria-label="재생 중인 곡">
      <button type="button" className="music-bar-info" onClick={onLocate} title="이 곡이 있는 칸으로 가기">
        <span className="music-bar-title">#{info.no} {info.title}</span>
        <span className="music-bar-sub">{info.label} · @{info.uploader}</span>
      </button>

      <div className="music-bar-controls">
        <button type="button" className="music-icon-btn" onClick={() => player.prev()} aria-label="이전 곡" title="이전 곡 (3초 넘게 들었으면 처음으로)">
          <PrevIcon />
        </button>
        <button
          type="button"
          className="music-bar-play"
          onClick={() => (state.playing ? player.pause() : player.resume())}
          aria-label={state.playing ? '멈춤' : '재생'}
        >
          {state.loading && !state.playing ? <Spinner /> : state.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="music-icon-btn" onClick={() => player.next()} aria-label="다음 곡" title="다음 곡">
          <NextIcon />
        </button>
      </div>

      <div className="music-bar-seek">
        <span className="music-bar-time">{formatTime(time)}</span>
        <input
          type="range"
          className="music-range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.1}
          value={duration > 0 ? Math.min(time, duration) : 0}
          disabled={!(duration > 0)}
          onChange={(e) => player.seek(parseFloat(e.target.value))}
          aria-label="재생 위치"
          aria-valuetext={`${formatTime(time)} / ${formatTime(duration || null)}`}
        />
        <span className="music-bar-time">{formatTime(duration > 0 ? duration : null)}</span>
      </div>

      <div className="music-bar-mode" role="group" aria-label="재생 방식">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className={state.mode === m.value ? 'active' : ''}
            aria-pressed={state.mode === m.value}
            title={m.hint}
            onClick={() => player.setMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <label className="music-bar-volume" title="소리 크기">
        <VolumeIcon muted={state.volume === 0} />
        <input
          type="range"
          className="music-range"
          min={0}
          max={1}
          step={0.05}
          value={state.volume}
          onChange={(e) => player.setVolume(parseFloat(e.target.value))}
          aria-label="소리 크기"
        />
      </label>

      <button type="button" className="music-icon-btn music-bar-close" onClick={() => player.stop()} aria-label="재생 닫기" title="닫기">
        ✕
      </button>

      {state.error && <div className="music-bar-error" role="alert">{state.error}</div>}
    </div>
  );
}
