import { supabase } from '../lib/supabase';

// 디자인 작업 공간 — 묶음 · 항목 · 파일 칸 · 올린 그림 · 일정.
// 테이블은 supabase/migrations/2026-11-05_design_workspace.sql, _design_v2.sql, _design_v3.sql.

export type DesignStatus = 'todo' | 'doing' | 'review' | 'done';
export type DesignColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'red';

export const DESIGN_COLORS: DesignColor[] = ['blue', 'orange', 'green', 'teal', 'purple', 'pink', 'yellow', 'red', 'brown', 'gray'];

export interface TagOption {
  value: string;
  label?: string;
  color: DesignColor;
}

export const colorOf = (options: TagOption[], value: string): DesignColor =>
  options.find((o) => o.value === value)?.color ?? 'gray';

export const DESIGN_STATUSES: { value: DesignStatus; label: string; color: DesignColor }[] = [
  { value: 'todo', label: '대기', color: 'gray' },
  { value: 'doing', label: '작업 중', color: 'blue' },
  { value: 'review', label: '검토', color: 'yellow' },
  { value: 'done', label: '완료', color: 'green' },
];

export const DESIGN_PRIORITIES: { value: string; color: DesignColor }[] = [
  { value: '우선 제작', color: 'red' },
  { value: '차순위 제작', color: 'orange' },
  { value: '제작 가능', color: 'green' },
  { value: '제작 보류', color: 'gray' },
];

export const DESIGN_CATEGORIES: { value: string; color: DesignColor }[] = [
  { value: '캐릭터', color: 'blue' },
  { value: '오브젝트', color: 'green' },
  { value: '타일', color: 'orange' },
  { value: '타일 표식', color: 'yellow' },
  { value: '아치', color: 'teal' },
  { value: '월드맵', color: 'green' },
  { value: '배경', color: 'brown' },
  { value: 'FX', color: 'purple' },
  { value: '컷씬', color: 'red' },
  { value: 'UI', color: 'pink' },
  { value: '스토어', color: 'gray' },
  { value: '준비', color: 'gray' },
];

export const DESIGN_ALPHAS: { value: string; color: DesignColor }[] = [
  { value: '투명', color: 'purple' },
  { value: '불투명', color: 'pink' },
  { value: '투명 가능', color: 'gray' },
];

export const DESIGN_ASSIGNEES: { value: string; color: DesignColor }[] = [
  { value: '시연', color: 'blue' },
  { value: '민준', color: 'orange' },
  { value: '소민', color: 'green' },
  { value: '전원', color: 'gray' },
];

/** 시안 · 가이드 그림의 우선순위. 담당자가 다시 그릴 때 참고한다. */
export const IMAGE_RANKS: TagOption[] = [
  { value: '1순위', color: 'red' },
  { value: '2순위', color: 'orange' },
  { value: '3순위', color: 'yellow' },
  { value: '보류', color: 'gray' },
];

export const TASK_CATEGORIES: { value: string; label: string; color: DesignColor }[] = [
  { value: 'base', label: '준비 · 수정', color: 'gray' },
  { value: 'char', label: '캐릭터', color: 'blue' },
  { value: 'play', label: '플레이맵', color: 'orange' },
  { value: 'world', label: '월드맵', color: 'green' },
  { value: 'late', label: '기믹 · FX · 컷씬 · 스토어', color: 'purple' },
  { value: 'dev', label: '개발', color: 'brown' },
  { value: 'mile', label: '확인 시점', color: 'red' },
];

export type Placement = 'tile' | 'mark' | 'stand' | 'solid' | 'arch' | 'center' | 'screen' | 'free';

export interface DesignGroup {
  id: string;
  name: string;
  note: string;
  color: DesignColor;
  sort_order: number;
}

export interface DesignItem {
  id: string;
  group_id: string;
  sort_order: number;
  name: string;
  category: string;
  alpha: string;
  priority: string;
  assignee: string;
  status: DesignStatus;
  description: string;   // 무엇을 그리는지
  rules: string;         // 참고 사항 (줄마다 하나)
  ideas: string;         // 참고 아이디어 (쉼표로 구분)
  is_new: boolean;       // 게임에 아직 그림 자리가 없는 항목
  split: boolean;        // 가이드와 채색을 나눠 맡는 항목. 이때 assignee 가 채색 담당
  guide_assignee: string;
  guide_done: boolean;
  task_id: string | null;        // 최종 마감을 정하는 타임라인 일정
  draft_task_id: string | null;  // 시안 · 가이드 마감을 정하는 타임라인 일정
}

/** 항목 안의 파일 칸. 그림은 칸마다 따로 올린다. */
export interface DesignFile {
  id: string;
  item_id: string;
  sort_order: number;
  file_name: string;
  label: string;
  canvas_w: number | null;
  canvas_h: number | null;
  body_w: number | null;
  body_h: number | null;
  bottom_px: number | null;   // 아래 여백
  face_px: number | null;     // 앞면 높이 (벽 · 블록처럼 앞면이 있는 그림)
  placement: Placement;
  spec_note: string;
  note: string;               // 이 파일의 설명
}

export interface DesignImage {
  id: string;
  item_id: string;
  file_id: string | null;   // 없으면 항목의 시안 · 가이드 그림
  sort_order: number;
  rank: string;
  picked: boolean;          // 채택
  path: string;
  file_name: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  uploader_name: string;
  created_at: string;
}

/** 그림 한 장에 달린 피드백. pin 이 있으면 그림 위 그 자리(0~1 비율)를 가리킨다. */
export interface DesignComment {
  id: string;
  image_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  pin_x: number | null;
  pin_y: number | null;
  created_at: string;
}

export interface DesignTask {
  id: string;
  name: string;
  owner: string;
  start_date: string;
  end_date: string;
  category: string;
  sort_order: number;
}

export interface DesignData {
  groups: DesignGroup[];
  items: DesignItem[];
  files: DesignFile[];
  images: DesignImage[];   // 최근에 올린 것부터
  comments: DesignComment[];
  tasks: DesignTask[];
}

const BUCKET = 'design-assets';
const PAGE = 1000;   // Supabase 는 한 번에 1000줄까지만 돌려준다

/** SQL 을 아직 실행하지 않아 테이블이나 칸이 없을 때 나는 오류인가. */
export function isDesignNotInstalled(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (!err) return false;
  if (err.code === 'PGRST205' || err.code === 'PGRST204' || err.code === '42P01' || err.code === '42703') return true;
  return typeof err.message === 'string' && /design_\w+/.test(err.message) && /does not exist|could not find|schema cache/i.test(err.message);
}

async function readAll<T>(table: string, column: string, ascending = true): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select('*')
      .order(column, { ascending }).order('id').range(rows.length, rows.length + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

export async function loadDesign(): Promise<DesignData> {
  const [groups, items, files, images, comments, tasks] = await Promise.all([
    readAll<DesignGroup>('design_groups', 'sort_order'),
    readAll<DesignItem>('design_items', 'sort_order'),
    readAll<DesignFile>('design_files', 'sort_order'),
    readAll<DesignImage>('design_images', 'created_at', false),
    readAll<DesignComment>('design_comments', 'created_at'),
    readAll<DesignTask>('design_tasks', 'sort_order'),
  ]);
  return { groups, items, files, images, comments, tasks };
}

async function insertRow<T>(table: string, row: object): Promise<T> {
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data as T;
}

async function updateRow(table: string, id: string, patch: object): Promise<void> {
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) throw error;
}

async function deleteRow(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export const insertGroup = (row: Pick<DesignGroup, 'name' | 'color' | 'sort_order'>) => insertRow<DesignGroup>('design_groups', row);
export const updateGroup = (id: string, patch: Partial<DesignGroup>) => updateRow('design_groups', id, patch);

export const insertItem = (row: Pick<DesignItem, 'group_id' | 'sort_order'> & Partial<DesignItem>) =>
  insertRow<DesignItem>('design_items', row);
export const updateItem = (id: string, patch: Partial<DesignItem>) =>
  updateRow('design_items', id, { ...patch, updated_at: new Date().toISOString() });

export const insertFile = (row: Pick<DesignFile, 'item_id' | 'sort_order'> & Partial<DesignFile>) =>
  insertRow<DesignFile>('design_files', row);
export const updateFile = (id: string, patch: Partial<DesignFile>) => updateRow('design_files', id, patch);

export const insertTask = (row: Omit<DesignTask, 'id'>) => insertRow<DesignTask>('design_tasks', row);
export const updateTask = (id: string, patch: Partial<DesignTask>) => updateRow('design_tasks', id, patch);
export const deleteTask = (id: string) => deleteRow('design_tasks', id);

/** 행을 먼저 지우고 파일을 지운다. 파일 삭제가 실패해도 화면에 깨진 그림이 남지 않는다. */
async function removeStored(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('design: 저장소 파일을 지우지 못했습니다', error);
}

export async function deleteGroup(id: string, imagePaths: string[]): Promise<void> {
  await deleteRow('design_groups', id);
  await removeStored(imagePaths);
}

export async function deleteItem(id: string, imagePaths: string[]): Promise<void> {
  await deleteRow('design_items', id);
  await removeStored(imagePaths);
}

export async function deleteFile(id: string, imagePaths: string[]): Promise<void> {
  await deleteRow('design_files', id);
  await removeStored(imagePaths);
}

export async function deleteImage(image: DesignImage): Promise<void> {
  await deleteRow('design_images', image.id);
  await removeStored([image.path]);
}

export const updateImage = (id: string, patch: Partial<DesignImage>) => updateRow('design_images', id, patch);

export const insertComment = (row: Pick<DesignComment, 'image_id' | 'author_name' | 'body' | 'pin_x' | 'pin_y'>) =>
  insertRow<DesignComment>('design_comments', row);
export const deleteComment = (id: string) => deleteRow('design_comments', id);

/** 게임 데이터. 게임 내용이 들어 있어 로그인한 사람만 받는 비공개 저장소에 둔다. */
export async function downloadGamePack(): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage.from('game-preview').download('index.pck');
  if (error) throw error;
  return data.arrayBuffer();
}

export function imageUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** 내려받기 주소. 원래 이름이 아니라 게임에 넣을 파일명으로 받는다. */
export function downloadUrl(path: string, name: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path, { download: name }).data.publicUrl;
}

async function pixelSize(picked: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(picked);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** 그림 하나를 올린다. slot 이 있으면 그 파일 칸에, 없으면 항목의 시안 · 가이드로. */
export async function uploadImage(
  target: { itemId: string; slot?: DesignFile; sortOrder?: number }, picked: File, uploaderName: string,
): Promise<DesignImage> {
  const { itemId, slot, sortOrder = 0 } = target;
  const size = await pixelSize(picked);
  // 저장소 경로는 영문만 되므로 원래 이름은 file_name 칸에 따로 둔다.
  const safeName = picked.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${itemId}/${slot?.id ?? 'draft'}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, picked, { contentType: picked.type || undefined });
  if (error) throw error;
  try {
    return await insertRow<DesignImage>('design_images', {
      item_id: itemId,
      file_id: slot?.id ?? null,
      sort_order: sortOrder,
      path,
      file_name: picked.name,
      width: size?.width ?? null,
      height: size?.height ?? null,
      size_bytes: picked.size,
      uploader_name: uploaderName,
    });
  } catch (e) {
    await removeStored([path]);
    throw e;
  }
}
