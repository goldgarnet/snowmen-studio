import { supabase } from '../lib/supabase';

// 디자인 작업 공간 — 묶음·항목·그림·일정. 테이블은 supabase/migrations/2026-11-05_design_workspace.sql.

export type DesignStatus = 'todo' | 'doing' | 'review' | 'done';

export const DESIGN_STATUSES: { value: DesignStatus; label: string }[] = [
  { value: 'todo', label: '대기' },
  { value: 'doing', label: '작업 중' },
  { value: 'review', label: '검토' },
  { value: 'done', label: '완료' },
];

export interface DesignGroup {
  id: string;
  name: string;
  sort_order: number;
}

export interface DesignItem {
  id: string;
  group_id: string;
  sort_order: number;
  name: string;
  file_name: string;
  spec: string;
  description: string;
  assignee: string;
  status: DesignStatus;
}

export interface DesignImage {
  id: string;
  item_id: string;
  path: string;
  file_name: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  uploader_name: string;
  created_at: string;
}

export interface DesignTask {
  id: string;
  name: string;
  owner: string;
  start_date: string;
  end_date: string;
  sort_order: number;
}

export interface DesignData {
  groups: DesignGroup[];
  items: DesignItem[];
  images: DesignImage[];   // 최근에 올린 것부터
  tasks: DesignTask[];
}

const BUCKET = 'design-assets';
const PAGE = 1000;   // Supabase 는 한 번에 1000줄까지만 돌려준다

/** SQL 을 아직 실행하지 않아 테이블이 없을 때 나는 오류인가. */
export function isDesignNotInstalled(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (!err) return false;
  if (err.code === 'PGRST205' || err.code === '42P01') return true;
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
  const [groups, items, images, tasks] = await Promise.all([
    readAll<DesignGroup>('design_groups', 'sort_order'),
    readAll<DesignItem>('design_items', 'sort_order'),
    readAll<DesignImage>('design_images', 'created_at', false),
    readAll<DesignTask>('design_tasks', 'sort_order'),
  ]);
  return { groups, items, images, tasks };
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

export const insertGroup = (name: string, sort_order: number) => insertRow<DesignGroup>('design_groups', { name, sort_order });
export const updateGroup = (id: string, patch: Partial<DesignGroup>) => updateRow('design_groups', id, patch);

export const insertItem = (row: Pick<DesignItem, 'group_id' | 'sort_order'> & Partial<DesignItem>) =>
  insertRow<DesignItem>('design_items', row);
export const updateItem = (id: string, patch: Partial<DesignItem>) =>
  updateRow('design_items', id, { ...patch, updated_at: new Date().toISOString() });

export const insertTask = (row: Omit<DesignTask, 'id'>) => insertRow<DesignTask>('design_tasks', row);
export const updateTask = (id: string, patch: Partial<DesignTask>) => updateRow('design_tasks', id, patch);
export const deleteTask = (id: string) => deleteRow('design_tasks', id);

/** 파일을 먼저 지우지 않고 행을 먼저 지운다. 파일 삭제가 실패해도 화면에 깨진 그림이 남지 않는다. */
async function removeFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('design: 저장소 파일을 지우지 못했습니다', error);
}

export async function deleteGroup(id: string, imagePaths: string[]): Promise<void> {
  await deleteRow('design_groups', id);
  await removeFiles(imagePaths);
}

export async function deleteItem(id: string, imagePaths: string[]): Promise<void> {
  await deleteRow('design_items', id);
  await removeFiles(imagePaths);
}

export async function deleteImage(image: DesignImage): Promise<void> {
  await deleteRow('design_images', image.id);
  await removeFiles([image.path]);
}

export function imageUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function pixelSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** 그림 하나를 올린다. 저장소 경로는 영문만 되므로 원래 이름은 file_name 칸에 따로 둔다. */
export async function uploadImage(itemId: string, file: File, uploaderName: string): Promise<DesignImage> {
  const size = await pixelSize(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${itemId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  try {
    return await insertRow<DesignImage>('design_images', {
      item_id: itemId,
      path,
      file_name: file.name,
      width: size?.width ?? null,
      height: size?.height ?? null,
      size_bytes: file.size,
      uploader_name: uploaderName,
    });
  } catch (e) {
    await removeFiles([path]);
    throw e;
  }
}
