import { createContext, useContext } from 'react';
import type { MusicPlayer, MusicTrack } from '../components/music/player';

// 사이트 전체가 같이 쓰는 음악 재생기(MusicProvider 가 한 번 만든다). 다른 탭으로 옮겨도 계속 나온다.
export interface MusicContextValue {
  player: MusicPlayer;
  /** 우측 하단 플레이어의 곡 이름 → 음악 탭의 그 곡으로(저장하지 않은 맵이 있으면 먼저 묻는다). */
  locate: (track: MusicTrack) => void;
  /** 음악 탭이 찾아 보여 줄 곡 id. 보여 준 뒤 clearLocate. */
  pendingLocate: string | null;
  clearLocate: () => void;
}

export const MusicContext = createContext<MusicContextValue | null>(null);

export function useMusic(): MusicContextValue {
  const value = useContext(MusicContext);
  if (!value) throw new Error('useMusic 은 MusicProvider 안에서만 쓸 수 있습니다.');
  return value;
}
