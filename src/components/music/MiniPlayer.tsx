import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { formatTime, PLAYBACK_RATES, rateLabel, stepPosition, validPeaks } from '../../lib/music';
import { useMusic } from '../../context/MusicContext';
import Waveform from './Waveform';
import {
  ChevronIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, QueueIcon, RepeatIcon, ShuffleIcon, Spinner, StopIcon, VolumeIcon,
} from './icons';
import { usePlayerState, usePlayerTime, type MusicPlayer, type PlayerState } from './player';
import './music.css';

// 우측 하단의 작은 플레이어 — 곡을 튼 동안 모든 화면에 떠 있다. 접으면 곡 이름만 남는다.
// 단추를 마우스로 눌러도 초점을 가져가지 않는다: 게임 화면에서 키보드로 놀던 것이 끊기지 않게.

const COLLAPSED_KEY = 'snowmen-studio:music:collapsed';

const REPEAT_TEXT = { off: '반복 안 함', all: '플레이리스트 반복', one: '한 곡 반복' } as const;

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; }
  catch { return false; }
}

const keepFocus = (e: MouseEvent) => e.preventDefault();

type Panel = 'queue' | 'rate' | 'volume' | null;

export default function MiniPlayer() {
  const { player, locate } = useMusic();
  const state = usePlayerState(player);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [panel, setPanel] = useState<Panel>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 펼친 창(대기열 · 배속 · 소리)은 바깥을 누르거나 Esc 로 닫는다.
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  const track = state.current;
  if (!track) return null;

  const setCollapsedSaved = (value: boolean) => {
    setCollapsed(value);
    setPanel(null);
    try { localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0'); } catch { /* 이번만 접는다 */ }
  };
  const togglePanel = (next: Exclude<Panel, null>) => setPanel((p) => (p === next ? null : next));
  const playIcon = state.loading && !state.playing ? <Spinner /> : state.playing ? <PauseIcon /> : <PlayIcon />;

  if (collapsed) {
    return (
      <div className="mini-player collapsed" ref={rootRef} role="region" aria-label="음악 플레이어 (접힘)">
        <button type="button" className="mini-play small" onMouseDown={keepFocus} onClick={() => player.toggle()}
          aria-label={state.playing ? '멈춤' : '재생'}>{playIcon}</button>
        <button type="button" className="mini-pill-title" onMouseDown={keepFocus} onClick={() => setCollapsedSaved(false)}
          title="플레이어 펼치기">{track.title}</button>
        <button type="button" className="mini-icon" onMouseDown={keepFocus} onClick={() => setCollapsedSaved(false)}
          aria-label="플레이어 펼치기" title="펼치기"><ChevronIcon up /></button>
      </div>
    );
  }

  const hasNext = stepPosition(state.queue, 1, state.repeat === 'off' ? 'off' : 'all') != null;
  const repeatLabel = `${REPEAT_TEXT[state.repeat]} (누르면 바뀜)`;

  return (
    <div className="mini-player" ref={rootRef} role="region" aria-label="음악 플레이어">
      {panel === 'queue' && <QueuePanel player={player} state={state} />}
      {panel === 'rate' && (
        <div className="mini-pop mini-rate" role="menu" aria-label="재생 속도">
          <span className="mini-pop-title">재생 속도</span>
          {PLAYBACK_RATES.map((rate) => (
            <button key={rate} type="button" role="menuitemradio" aria-checked={state.rate === rate}
              className={state.rate === rate ? 'active' : ''} onMouseDown={keepFocus}
              onClick={() => { player.setRate(rate); setPanel(null); }}>
              {rate === 1 ? '보통 (1×)' : rateLabel(rate)}
            </button>
          ))}
        </div>
      )}
      {panel === 'volume' && (
        <div className="mini-pop mini-volume" aria-label="소리 크기">
          <span className="mini-pop-title">소리 크기 {state.muted ? '(음소거)' : `${Math.round(state.volume * 100)}%`}</span>
          <input type="range" className="music-range" min={0} max={1} step={0.05}
            value={state.muted ? 0 : state.volume} aria-label="소리 크기"
            onChange={(e) => player.setVolume(parseFloat(e.target.value))} />
          <button type="button" className="mini-text-btn" onMouseDown={keepFocus} onClick={() => player.toggleMute()}>
            {state.muted ? '소리 켜기' : '음소거'}
          </button>
        </div>
      )}

      <div className="mini-top">
        <button type="button" className="mini-title" onMouseDown={keepFocus} onClick={() => locate(track)}
          title="음악 탭에서 이 곡 보기">
          <span className="mini-title-text">{track.title}</span>
          <span className="mini-sub">{track.album} · @{track.artist}</span>
        </button>
        <button type="button" className="mini-icon" onMouseDown={keepFocus} onClick={() => setCollapsedSaved(true)}
          aria-label="작게 접기" title="작게 접기"><ChevronIcon /></button>
        <button type="button" className="mini-icon" onMouseDown={keepFocus} onClick={() => player.close()}
          aria-label="플레이어 닫기" title="닫기 (대기열 비우기)">✕</button>
      </div>

      <MiniSeek player={player} state={state} />
      {state.error && <div className="mini-error" role="alert">{state.error}</div>}

      <div className="mini-controls">
        <button type="button" className={`mini-icon${state.shuffle ? ' on' : ''}`} onMouseDown={keepFocus}
          onClick={() => player.setShuffle(!state.shuffle)} aria-pressed={state.shuffle}
          aria-label="랜덤 재생" title={state.shuffle ? '랜덤 재생 끄기' : '랜덤 재생'}><ShuffleIcon /></button>
        <button type="button" className="mini-icon" onMouseDown={keepFocus} onClick={() => player.prev()}
          aria-label="이전 곡" title="이전 곡 (3초 넘게 들었으면 처음으로)"><PrevIcon /></button>
        <button type="button" className="mini-play" onMouseDown={keepFocus} onClick={() => player.toggle()}
          aria-label={state.playing ? '멈춤' : '재생'}>{playIcon}</button>
        <button type="button" className="mini-icon" onMouseDown={keepFocus} onClick={() => player.next()}
          disabled={!hasNext} aria-label="다음 곡" title="다음 곡"><NextIcon /></button>
        <button type="button" className={`mini-icon${state.repeat !== 'off' ? ' on' : ''}`} onMouseDown={keepFocus}
          onClick={() => player.cycleRepeat()} aria-label={repeatLabel} title={repeatLabel}>
          <RepeatIcon one={state.repeat === 'one'} />
        </button>
        <span className="mini-sep" aria-hidden="true" />
        <button type="button" className="mini-icon" onMouseDown={keepFocus} onClick={() => player.stop()}
          aria-label="정지" title="정지 (처음으로)"><StopIcon /></button>
        <button type="button" className={`mini-rate-btn${state.rate !== 1 ? ' on' : ''}`} onMouseDown={keepFocus}
          onClick={() => togglePanel('rate')} aria-expanded={panel === 'rate'} aria-label={`재생 속도 ${rateLabel(state.rate)}`}
          title="재생 속도">{rateLabel(state.rate)}</button>
        <button type="button" className={`mini-icon${state.muted ? ' on' : ''}`} onMouseDown={keepFocus}
          onClick={() => togglePanel('volume')} aria-expanded={panel === 'volume'} aria-label="소리 크기" title="소리 크기">
          <VolumeIcon muted={state.muted || state.volume === 0} />
        </button>
        <button type="button" className={`mini-icon${panel === 'queue' ? ' on' : ''}`} onMouseDown={keepFocus}
          onClick={() => togglePanel('queue')} aria-expanded={panel === 'queue'} aria-label="재생 대기열" title="재생 대기열">
          <QueueIcon />
        </button>
      </div>
    </div>
  );
}

// 파형 = 재생 위치 막대. 위치를 받아 다시 그리는 것은 이 부분뿐이다.
function MiniSeek({ player, state }: { player: MusicPlayer; state: PlayerState }) {
  const time = usePlayerTime(player);
  const track = state.current;
  if (!track) return null;
  const duration = state.duration > 0 ? state.duration : track.duration ?? 0;
  return (
    <div className="mini-seek">
      <Waveform
        peaks={validPeaks(track.peaks)}
        duration={duration}
        time={time}
        active
        compact
        label={track.title}
        onSeek={(ratio) => player.seekRatio(ratio)}
      />
      <div className="mini-times">
        <span>{formatTime(time)}</span>
        <span className="mini-source" title={state.source ?? undefined}>{state.source ?? ''}</span>
        <span>{formatTime(duration > 0 ? duration : null)}</span>
      </div>
    </div>
  );
}

function QueuePanel({ player, state }: { player: MusicPlayer; state: PlayerState }) {
  const listRef = useRef<HTMLOListElement>(null);
  const { queue } = state;
  // 열면 지금 곡이 보이게
  useEffect(() => {
    listRef.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <div className="mini-pop mini-queue" aria-label="재생 대기열">
      <div className="mini-queue-head">
        <b>재생 대기열</b>
        <span>{state.source ? `${state.source} · ` : ''}{queue.order.length}곡{state.shuffle ? ' · 랜덤' : ''}</span>
      </div>
      <ol ref={listRef}>
        {queue.order.map((itemIndex, pos) => {
          const t = queue.items[itemIndex];
          const isCurrent = pos === queue.position;
          return (
            <li key={`${t.id}-${pos}`} className={isCurrent ? 'current' : pos < queue.position ? 'played' : undefined}>
              <button type="button" className="mini-queue-track" onMouseDown={keepFocus} onClick={() => player.jump(pos)}
                title={isCurrent ? '지금 곡' : '이 곡 틀기'}>
                <span className="mini-queue-no">{isCurrent ? (state.playing ? '▶' : '❚❚') : pos + 1}</span>
                <span className="mini-queue-title">{t.title}</span>
                <span className="mini-queue-time">{formatTime(t.duration)}</span>
              </button>
              {!isCurrent && (
                <button type="button" className="mini-queue-remove" onMouseDown={keepFocus} onClick={() => player.removeAt(pos)}
                  aria-label={`${t.title} 대기열에서 빼기`} title="대기열에서 빼기">✕</button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
