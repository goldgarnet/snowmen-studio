import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MusicContext, type MusicContextValue } from '../../context/MusicContext';
import { useGuard } from '../../context/GuardContext';
import { chapterMusicUrl } from '../../lib/music';
import * as nav from '../../lib/nav';
import MiniPlayer from './MiniPlayer';
import { createMusicPlayer, type MusicTrack } from './player';
import { cachedMusicUrl, freshMusicUrl } from './urls';

// 로그인한 화면 전체를 감싼다. 재생기는 여기서 한 번 만들어 탭을 옮겨도 이어서 들린다.
// 로그아웃 · 계정 바꾸기로 이 부분이 내려가면 소리도 멈춘다.
export default function MusicProvider({ children }: { children: ReactNode }) {
  const [player] = useState(() => createMusicPlayer({ cachedUrl: cachedMusicUrl, freshUrl: freshMusicUrl }));
  useEffect(() => player.attach(), [player]);
  const { attempt } = useGuard();
  const [pendingLocate, setPendingLocate] = useState<string | null>(null);

  const locate = useCallback((track: MusicTrack) => {
    attempt(() => {
      setPendingLocate(track.id);
      nav.go(chapterMusicUrl(track.chapterKey));
    });
  }, [attempt]);
  const clearLocate = useCallback(() => setPendingLocate(null), []);

  const value = useMemo<MusicContextValue>(
    () => ({ player, locate, pendingLocate, clearLocate }),
    [player, locate, pendingLocate, clearLocate],
  );

  return (
    <MusicContext.Provider value={value}>
      {children}
      <MiniPlayer />
    </MusicContext.Provider>
  );
}
