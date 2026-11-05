import type { DesignFile, DesignImage } from '../api/design';
// 디자인 작업 공간의 순수 로직 — 순서 바꾸기, 그림 규격 검사, 타임라인 날짜 계산.
// 화면과 DB 를 모르므로 test/design/run.cjs 가 그대로 불러와 검사한다.

export interface Sortable {
  id: string;
  sort_order: number;
}

export interface MovableItem extends Sortable {
  group_id: string;
}

export const bySortOrder = (a: Sortable, b: Sortable) => a.sort_order - b.sort_order;

/** list 안에서 id 를 beforeId 앞으로(null 이면 맨 뒤로) 옮긴다. 순서가 바뀐 행만 changed 에 담긴다. */
export function reorder<T extends Sortable>(list: T[], id: string, beforeId: string | null): { next: T[]; changed: T[] } {
  const sorted = [...list].sort(bySortOrder);
  const moving = sorted.find((x) => x.id === id);
  if (!moving || id === beforeId) return { next: sorted, changed: [] };
  const rest = sorted.filter((x) => x.id !== id);
  const at = beforeId ? rest.findIndex((x) => x.id === beforeId) : -1;
  rest.splice(at < 0 ? rest.length : at, 0, moving);
  const next = rest.map((x, i) => (x.sort_order === i ? x : { ...x, sort_order: i }));
  return { next, changed: next.filter((x, i) => x !== rest[i]) };
}

/** 항목을 toGroupId 묶음의 beforeId 앞으로 옮긴다. 묶음이 바뀌어도 된다. */
export function moveItem<T extends MovableItem>(
  items: T[], id: string, toGroupId: string, beforeId: string | null,
): { next: T[]; changed: T[] } {
  const moving = items.find((x) => x.id === id);
  if (!moving || id === beforeId) return { next: items, changed: [] };
  const crossing = moving.group_id !== toGroupId;
  const placed = crossing ? { ...moving, group_id: toGroupId } : moving;
  const others = items.filter((x) => x.id !== id && x.group_id !== toGroupId && x.group_id !== moving.group_id);
  const target = [...items.filter((x) => x.id !== id && x.group_id === toGroupId), placed];
  const { next: targetNext, changed } = reorder(target, id, beforeId);
  const changedList = [...changed];
  if (crossing && !changedList.some((x) => x.id === id)) changedList.push(targetNext.find((x) => x.id === id) as T);
  // 떠난 묶음은 빈 번호가 생겨도 순서가 그대로라 다시 매기지 않는다.
  const source = crossing ? items.filter((x) => x.id !== id && x.group_id === moving.group_id) : [];
  return { next: [...others, ...source, ...targetNext], changed: changedList };
}

// ---------- 파일 칸 ----------

export interface SlotSpec {
  canvas_w: number | null;
  canvas_h: number | null;
  body_w: number | null;
  body_h: number | null;
  bottom_px: number | null;
  placement: string;
}

/**
 * 피드백 창에 그림을 놓는 배율. 원본보다 키우지 않고, 화면보다 크면 다 보이게 줄인다. 크기를 모르면 0.
 * pageZoom 은 사이트 전체에 걸린 확대(body zoom)다. 이만큼 덜어야 화면에서 정확히 원본 크기가 된다.
 */
export function viewerZoom(width: number, height: number, boxW: number, boxH: number, pageZoom = 1): number {
  if (!width || !height || !boxW || !boxH) return 0;
  return Math.min(boxW / width, boxH / height, 1 / pageZoom);
}

/** 올린 그림이 칸의 캔버스 크기와 다르면 안내 문구를, 맞으면 null 을 돌려준다. 크기를 모르면 검사하지 않는다. */
export function sizeProblem(slot: SlotSpec, width: number | null, height: number | null): string | null {
  if (slot.canvas_w == null || slot.canvas_h == null || width == null || height == null) return null;
  if (slot.canvas_w === width && slot.canvas_h === height) return null;
  return `크기가 다릅니다: 올린 그림 ${width} × ${height} px, 규격 ${slot.canvas_w} × ${slot.canvas_h} px`;
}

/** 캔버스 안에서 본체가 차지하는 상자(왼쪽 위 기준 px). 본체 크기를 모르면 null. */
export function bodyBox(slot: SlotSpec): { x: number; y: number; w: number; h: number } | null {
  const { canvas_w: cw, canvas_h: ch, body_w: bw, body_h: bh } = slot;
  if (cw == null || ch == null || bw == null || bh == null) return null;
  const x = (cw - bw) / 2;
  if (slot.placement === 'mark' || slot.placement === 'center') return { x, y: (ch - bh) / 2, w: bw, h: bh };
  return { x, y: ch - (slot.bottom_px ?? 0) - bh, w: bw, h: bh };
}

/** 항목 줄에 그림을 놓았을 때 들어갈 칸: 이름이 같은 칸 → 빈 칸 → 첫 칸. 칸이 없으면 null. */
export function slotForDrop<T extends { id: string; file_name: string }>(slots: T[], filled: Set<string>, name: string): T | null {
  return slots.find((s) => s.file_name === name) ?? slots.find((s) => !filled.has(s.id)) ?? slots[0] ?? null;
}

/** 시안을 채택해 넣은 최종 파일 행. 둘은 저장소 파일을 함께 쓰므로 경로로 찾는다. */
export function adoptedRows<T extends { path: string; file_id: string | null }>(draft: { path: string }, images: T[]): T[] {
  return images.filter((i) => i.file_id && i.path === draft.path);
}

/** 지워도 되는 저장소 파일. 남는 그림이 같은 파일을 쓰면 뺀다. */
export function unusedPaths<T extends { id: string; path: string }>(gone: T[], images: T[]): string[] {
  const goneIds = new Set(gone.map((i) => i.id));
  const kept = new Set(images.filter((i) => !goneIds.has(i.id)).map((i) => i.path));
  return [...new Set(gone.map((i) => i.path))].filter((p) => !kept.has(p));
}

/** 채택할 때 고를 파일 칸. 칸이 하나면 바로 넣고, 가이드는 채색의 밑그림이라 최종 파일에 넣지 않는다. */
export function pickChoices(
  item: { split: boolean }, slots: { id: string; label: string; file_name: string }[], images: { file_id: string | null }[],
): { id: string; label: string }[] {
  if (item.split || slots.length < 2) return [];
  return slots.map((s) => ({
    id: s.id,
    label: `${s.label || s.file_name || '파일'}${images.some((i) => i.file_id === s.id) ? ' · 올림' : ''}`,
  }));
}

/** 그림을 올린 뒤의 상태. 칸이 다 차면 검토로, 일부만 찼으면 작업 중으로. 검토 · 완료는 그대로 둔다. */
export function statusAfterUpload<T extends string>(status: T, filled: number, total: number): T | 'doing' | 'review' {
  if (status !== 'todo' && status !== 'doing') return status;
  return total > 0 && filled >= total ? 'review' : 'doing';
}

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** 검색: 띄어쓰기와 대소문자를 무시하고, 낱말이 모두 들어 있어야 맞다. */
export function matchesQuery(query: string, fields: string[]): boolean {
  const words = query.trim().split(/\s+/).filter(Boolean).map(fold);
  if (words.length === 0) return true;
  const text = fold(fields.join(' '));
  return words.every((w) => text.includes(w));
}

/** 줄 나눔 글을 목록으로. 빈 줄은 뺀다. */
export const textLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
/** 쉼표로 나눈 아이디어를 낱개로. */
export const ideaList = (text: string) => text.split(/[,\n]/).map((l) => l.trim()).filter(Boolean);

// 날짜는 'YYYY-MM-DD' 문자열로 다룬다. UTC 로 계산해 시간대 때문에 하루 밀리지 않게 한다.
const DAY_MS = 86_400_000;
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, days: number) => fromUtc(toUtc(d) + days * DAY_MS);
export const diffDays = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);

/** d 가 속한 주의 월요일. */
export function mondayOf(d: string): string {
  const weekday = new Date(toUtc(d)).getUTCDay();   // 0 = 일요일
  return addDays(d, -((weekday + 6) % 7));
}

export type DragMode = 'move' | 'start' | 'end';

/** 막대를 days 만큼 끌었을 때의 시작·끝. 양 끝을 끌어도 끝이 시작보다 앞서지 않는다. */
export function dragDates(start: string, end: string, days: number, mode: DragMode): { start: string; end: string } {
  if (mode === 'move') return { start: addDays(start, days), end: addDays(end, days) };
  if (mode === 'start') {
    const s = addDays(start, days);
    return { start: diffDays(s, end) < 0 ? end : s, end };
  }
  const e = addDays(end, days);
  return { start, end: diffDays(start, e) < 0 ? start : e };
}

// ---------- 마감 ----------

export interface DueTask {
  id: string;
  name: string;
  owner: string;
  category: string;
  start_date: string;
  end_date: string;
}

export interface DueItem {
  status: string;
  split: boolean;
  guide_done: boolean;
  task_id: string | null;
  draft_task_id: string | null;
}

export interface Deadline {
  label: string;     // 시안 · 완성 또는 가이드 · 채색
  date: string;
  days: number;      // 오늘부터 남은 날. 지났으면 음수
  done: boolean;
}

/** 항목의 마감 목록. 전용 일정이 없는 가이드 마감은 일정의 가운데 날로 잡는다. */
export function itemDeadlines(item: DueItem, tasks: Map<string, DueTask>, hasPick: boolean, today: string): Deadline[] {
  const final = item.task_id ? tasks.get(item.task_id) : undefined;
  const draft = item.draft_task_id ? tasks.get(item.draft_task_id) : undefined;
  const draftDate = draft?.end_date
    ?? (item.split && final ? addDays(final.start_date, Math.floor(diffDays(final.start_date, final.end_date) / 2)) : undefined);
  const list: Deadline[] = [];
  if (draftDate) {
    list.push({ label: item.split ? '가이드' : '시안', date: draftDate, days: diffDays(today, draftDate), done: item.split ? item.guide_done : hasPick });
  }
  if (final) {
    list.push({ label: item.split ? '채색' : '완성', date: final.end_date, days: diffDays(today, final.end_date), done: item.status === 'done' });
  }
  return list;
}

/** 지금 맞춰야 할 마감: 끝나지 않은 첫 마감. 항목이 완료면 없다. */
export const currentDeadline = (list: Deadline[], status: string): Deadline | null =>
  (status === 'done' ? null : list.find((d) => !d.done) ?? null);

export const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function daysLeft(days: number): string {
  if (days === 0) return '오늘까지';
  return days > 0 ? `D-${days}` : `${-days}일 지남`;
}

/** 디자인 작업만 본다. 개발 일정과 확인 시점은 뺀다. */
const isWork = (t: DueTask) => t.category !== 'mile' && t.category !== 'dev';

/** 오늘 진행 중인 일정. 마감이 가까운 것부터. */
export const activeTasks = <T extends DueTask>(tasks: T[], today: string): T[] =>
  tasks.filter((t) => isWork(t) && t.start_date <= today && today <= t.end_date)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));

/** 오늘 뒤에 처음 시작하는 일정들. 같은 날 시작하는 일정을 모두 돌려준다. */
export function nextTasks<T extends DueTask>(tasks: T[], today: string): T[] {
  const later = tasks.filter((t) => isWork(t) && t.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  return later.filter((t) => t.start_date === later[0].start_date);
}

/** 오늘을 포함해 가장 가까운 확인 시점. */
export const nextCheck = <T extends DueTask>(tasks: T[], today: string): T | null =>
  tasks.filter((t) => t.category === 'mile' && t.start_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;

/** 타임라인에 그릴 범위: 오늘과 모든 일정을 담고, 월요일에서 시작해 월요일에서 끝난다. */
export function timelineRange(tasks: { start_date: string; end_date: string }[], today: string): { from: string; weeks: number } {
  let min = today;
  let max = addDays(today, 7 * 12);
  for (const t of tasks) {
    if (t.start_date < min) min = t.start_date;
    if (t.end_date > max) max = t.end_date;
  }
  const from = mondayOf(min);
  const weeks = Math.ceil((diffDays(from, max) + 1) / 7) + 1;
  return { from, weeks };
}

// ── 게임에서 보기 ─────────────────────────────────────────────────────────────

export interface PreviewArt {
  key: string;
  fileName: string;
  imageId: string;
  path: string;
  sizeNote: string | null;
}

const IMAGE_FILE = /\.(png|webp|jpe?g)$/i;

/** 게임은 파일명에서 확장자를 뺀 값으로 그림을 찾는다. ch3/tile_cold.png → ch3/tile_cold */
export const artKey = (fileName: string) => fileName.trim().replace(/\.[^./]+$/, '');

/** 파일명마다 가장 최근에 올린 그림 한 장. images 는 최신순이다. */
export function previewArt(files: DesignFile[], images: DesignImage[]): PreviewArt[] {
  const slots = new Map(files.map((f) => [f.id, f]));
  const art = new Map<string, PreviewArt>();
  for (const image of images) {
    const slot = image.file_id ? slots.get(image.file_id) : undefined;
    const fileName = (slot?.file_name ?? '').trim();
    if (!slot || !IMAGE_FILE.test(fileName)) continue;
    const key = artKey(fileName);
    if (art.has(key)) continue;
    art.set(key, { key, fileName, imageId: image.id, path: image.path, sizeNote: sizeProblem(slot, image.width, image.height) });
  }
  return [...art.values()];
}

/** ch3/tile_cold → 3. 챕터 공용 그림이면 0. */
export const artChapter = (key: string) => Number(/^ch(\d+)\//.exec(key)?.[1] ?? 0);
