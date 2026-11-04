// 작업 공간 — 게임 제작(허브·맵 제작 등)과 디자인 작업. 마지막에 쓴 쪽을 기억해 다음에 / 로 열면 그쪽으로 간다.

export type Workspace = 'game' | 'design';

const KEY = 'snowmen-studio-workspace';

export const workspaceHome = (w: Workspace) => (w === 'design' ? '/design' : '/');
export const workspaceOfPath = (pathname: string): Workspace => (/^\/design\/?$/.test(pathname) ? 'design' : 'game');

export function readWorkspace(): Workspace {
  try { return localStorage.getItem(KEY) === 'design' ? 'design' : 'game'; }
  catch { return 'game'; }
}

export function saveWorkspace(w: Workspace): void {
  try { localStorage.setItem(KEY, w); }
  catch { /* 기억하지 못해도 이번 화면은 그대로 쓴다 */ }
}
