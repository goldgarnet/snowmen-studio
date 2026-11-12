// 재생 버튼 아이콘 — 글자 이모지보다 크기와 가운데가 반듯하다.

export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
);

export const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
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

export const VolumeIcon = ({ muted }: { muted?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    {muted
      ? <path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      : <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />}
  </svg>
);

export const Spinner = () => <span className="music-spinner" aria-hidden="true" />;
