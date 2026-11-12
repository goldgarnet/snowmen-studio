import { signMusicUrls, SIGNED_URL_SECONDS } from '../../api/music';

// 듣기 주소(서명한 주소) 모음. 비공개 저장소라 곡마다 주소를 받아야 들을 수 있다.
// 미리 받아 두는 까닭: 누른 그 순간에 재생을 시작해야 브라우저(특히 Safari)가 소리를 막지 않는다.
// 탭을 떠났다 돌아와도 다시 받지 않게 화면 밖(모듈)에 둔다.

/** 주소가 만료되기 30분 전까지만 다시 쓴다. */
const REUSE_MS = (SIGNED_URL_SECONDS - 30 * 60) * 1000;

const cache = new Map<string, { url: string; at: number }>();

const fresh = (path: string, now = Date.now()) => {
  const entry = cache.get(path);
  return entry && now - entry.at < REUSE_MS ? entry.url : null;
};

/** 바로 쓸 수 있는 주소 (없거나 낡았으면 null) */
export const cachedMusicUrl = (path: string): string | null => fresh(path);

/** 새 주소를 받아 둔다. */
export async function freshMusicUrl(path: string): Promise<string> {
  const url = (await signMusicUrls([path])).get(path);
  if (!url) throw new Error('듣기 주소를 받지 못했습니다');
  cache.set(path, { url, at: Date.now() });
  return url;
}

/** 아직 없거나 낡은 주소만 한 번에 받아 둔다. 실패해도 누를 때 다시 받는다. */
export async function prefetchMusicUrls(paths: string[]): Promise<void> {
  const now = Date.now();
  const need = paths.filter((p) => !fresh(p, now));
  if (need.length === 0) return;
  try {
    for (const [path, url] of await signMusicUrls(need)) cache.set(path, { url, at: now });
  } catch (e) {
    console.warn('music: 듣기 주소를 받지 못했습니다', e);
  }
}
