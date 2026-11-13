// 플레이어 아이콘 — 글자 이모지보다 크기와 가운데가 반듯하다. 색은 글자색(currentColor)을 따른다.

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const PlayIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
);

export const PauseIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor" />
    <rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor" />
  </svg>
);

export const PrevIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <rect x="5" y="6" width="2.6" height="12" rx="1" fill="currentColor" /><path d="M19 6v12l-9.5-6z" fill="currentColor" />
  </svg>
);

export const NextIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <rect x="16.4" y="6" width="2.6" height="12" rx="1" fill="currentColor" /><path d="M5 6v12l9.5-6z" fill="currentColor" />
  </svg>
);

export const StopIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.8" fill="currentColor" /></svg>
);

export const ShuffleIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" {...S}>
    <path d="M4 7h3.2c1.6 0 2.6.7 3.5 2l3.6 6c.9 1.3 1.9 2 3.5 2H20" />
    <path d="M4 17h3.2c1.6 0 2.6-.7 3.5-2" /><path d="M14.3 9c.9-1.3 1.9-2 3.5-2H20" />
    <path d="M17.5 4.5 20 7l-2.5 2.5" /><path d="M17.5 14.5 20 17l-2.5 2.5" />
  </svg>
);

export const RepeatIcon = ({ one }: { one?: boolean }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" {...S}>
    <path d="M5 11V9.5A2.5 2.5 0 0 1 7.5 7H19" /><path d="M16.5 4.5 19 7l-2.5 2.5" />
    <path d="M19 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5" /><path d="M7.5 19.5 5 17l2.5-2.5" />
    {one && <path d="M11.3 10.6 12.4 10v4.2" strokeWidth={1.6} />}
  </svg>
);

export const QueueIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" {...S}>
    <path d="M4 6.5h11" /><path d="M4 11.5h11" /><path d="M4 16.5h6.5" /><path d="M14.5 15v4.8" /><path d="M14.5 15l4.5 2.4-4.5 2.4" fill="currentColor" />
  </svg>
);

export const VolumeIcon = ({ muted }: { muted?: boolean }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    {muted
      ? <path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      : <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />}
  </svg>
);

export const ChevronIcon = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...S}>
    <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
);

export const MoreIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="12" cy="5.5" r="1.7" fill="currentColor" /><circle cx="12" cy="12" r="1.7" fill="currentColor" /><circle cx="12" cy="18.5" r="1.7" fill="currentColor" />
  </svg>
);

export const DragIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    {[7, 12, 17].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />))}
  </svg>
);

/** 재생 중인 곡 표시 — 움직이는 막대 셋 */
export const Equalizer = ({ paused }: { paused?: boolean }) => (
  <span className={`music-eq${paused ? ' paused' : ''}`} aria-hidden="true"><i /><i /><i /></span>
);

export const Spinner = () => <span className="music-spinner" aria-hidden="true" />;
