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
