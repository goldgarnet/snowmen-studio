const DRAFT_KEY_PREFIX = 'snowmen-studio:editor-draft:v1';

export interface EditorDraft {
  version: 1;
  mapId: string | null;
  folderId: string | null;
  title: string;
  code: string;
  savedCode: string;
  savedTitle: string;
  updatedAt: string;
}

function key(ownerId: string, mapId: string | null): string {
  return `${DRAFT_KEY_PREFIX}:${ownerId}:${mapId ?? 'new'}`;
}

function isEditorDraft(value: unknown): value is EditorDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<EditorDraft>;
  return draft.version === 1
    && (typeof draft.mapId === 'string' || draft.mapId === null)
    && (typeof draft.folderId === 'string' || draft.folderId === null)
    && typeof draft.title === 'string'
    && typeof draft.code === 'string'
    && typeof draft.savedCode === 'string'
    && typeof draft.savedTitle === 'string'
    && typeof draft.updatedAt === 'string';
}

export function readEditorDraft(ownerId: string, mapId: string | null): EditorDraft | null {
  try {
    const raw = localStorage.getItem(key(ownerId, mapId));
    if (!raw) return null;
    const draft: unknown = JSON.parse(raw);
    return isEditorDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function writeEditorDraft(ownerId: string, draft: EditorDraft): void {
  try {
    localStorage.setItem(key(ownerId, draft.mapId), JSON.stringify(draft));
  } catch {
    // Private browsing or a full quota must never prevent map editing.
  }
}

export function removeEditorDraft(ownerId: string, mapId: string | null): void {
  try {
    localStorage.removeItem(key(ownerId, mapId));
  } catch {
    // See writeEditorDraft: caching is an enhancement, not a requirement to edit.
  }
}
