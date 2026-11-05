import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../../api/design';
import type { DesignColor, DesignComment, DesignData, DesignFile, DesignGroup, DesignImage, DesignItem, DesignTask } from '../../api/design';
import { adoptedRows, bySortOrder, finalDeadline, insertSlot, itemDeadlines, matchesQuery, moveItem, pickChoices, reorder, slotForDrop, statusAfterUpload, unusedPaths } from '../../lib/designBoard';
import ConfirmModal from '../common/ConfirmModal';
import DesignBoard, { type BoardActions, type BoardRows } from './DesignBoard';
import DesignItemPanel from './DesignItemPanel';
import DesignNow from './DesignNow';
import DesignPreview from './DesignPreview';
import DesignTimeline from './DesignTimeline';
import DesignViewer from './DesignViewer';
import './design.css';

// 디자인 작업 공간 — 항목 보드, 타임라인, 게임에서 보기. 로그인한 팀원 전원이 함께 고친다.
//   · 바꾼 내용은 화면에 먼저 반영하고 저장한다. 저장에 실패하면 오류를 띄우고 서버 값으로 되돌린다.
//   · 다른 사람이 고친 내용은 이 창으로 돌아올 때 다시 읽어 온다.

type View = 'board' | 'timeline' | 'preview';
let lastView: View = 'board';   // 다른 탭에 다녀와도 보던 화면으로

const OPEN_KEY = 'snowmen-design-open-groups';
const WHO_FILTERS = [
  { value: 'all', label: '전체' },
  { value: '시연', label: '시연' },
  { value: '민준', label: '민준' },
  { value: '소민', label: '소민' },
  { value: 'none', label: '담당 미정' },
];

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const nextOrder = (rows: { sort_order: number }[]) => rows.reduce((m, r) => Math.max(m, r.sort_order + 1), 0);

function readOpenGroups(): string[] | null {
  try {
    const saved = localStorage.getItem(OPEN_KEY);
    return saved ? (JSON.parse(saved) as string[]) : null;
  } catch {
    return null;
  }
}

interface PendingDelete {
  title: string;
  message: string;
  run: () => Promise<void>;
}

export default function DesignWorkspace({ userName, userId }: { userName: string; userId: string }) {
  const [data, setData] = useState<DesignData | null>(null);
  const [notInstalled, setNotInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(lastView);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyFiles, setBusyFiles] = useState<Set<string>>(new Set());
  const [busyDraft, setBusyDraft] = useState(false);
  const [viewing, setViewing] = useState<DesignImage | null>(null);
  const [newTaskId, setNewTaskId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [openGroups, setOpenGroups] = useState<string[] | null>(readOpenGroups);
  const [query, setQuery] = useState('');
  const [who, setWho] = useState('all');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [today] = useState(localToday);

  const dataRef = useRef<DesignData | null>(null);
  useEffect(() => { dataRef.current = data; });

  const setView = (v: View) => { lastView = v; setViewState(v); };

  const reload = useCallback(async () => {
    try {
      const next = await api.loadDesign();
      setData(next);
      setNotInstalled(false);
    } catch (e) {
      if (api.isDesignNotInstalled(e)) setNotInstalled(true);
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void api.loadDesign()
      .then((next) => { if (active) setData(next); })
      .catch((e: unknown) => {
        if (!active) return;
        if (api.isDesignNotInstalled(e)) setNotInstalled(true);
        else setError((e as Error).message);
      });
    window.addEventListener('focus', reload);
    return () => { active = false; window.removeEventListener('focus', reload); };
  }, [reload]);

  // 칸 밖에 그림을 놓아도 브라우저가 그 그림으로 이동해 버리지 않게 한다.
  useEffect(() => {
    const stop = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop); };
  }, []);

  const save = useCallback((work: Promise<unknown>) => {
    work.catch((e: unknown) => {
      setError(`저장하지 못했습니다: ${(e as Error).message}`);
      void reload();
    });
  }, [reload]);

  const change = (fn: (d: DesignData) => DesignData) => setData((d) => (d ? fn(d) : d));
  const pathsOf = (itemIds: string[]) =>
    (dataRef.current?.images ?? []).filter((i) => itemIds.includes(i.item_id)).map((i) => i.path);

  const patchItem = (id: string, patch: Partial<DesignItem>) => {
    change((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    save(api.updateItem(id, patch));
  };

  const updateStatus = (item: DesignItem, filled: Set<string>) => {
    const total = (dataRef.current?.files ?? []).filter((f) => f.item_id === item.id).length;
    const current = dataRef.current?.items.find((i) => i.id === item.id)?.status ?? item.status;
    const next = statusAfterUpload(current, filled.size, Math.max(total, filled.size));
    if (next !== current) patchItem(item.id, { status: next });
  };

  // 칸 하나에 파일 하나를 올린다. filled 는 이 항목에서 그림이 있는 칸들로, 연달아 올릴 때 이어서 쓴다.
  const uploadOne = async (item: DesignItem, slot: DesignFile, picked: File, filled: Set<string>) => {
    setBusyFiles((s) => new Set(s).add(slot.id));
    try {
      const image = await api.uploadImage({ itemId: item.id, slot }, picked, userName);
      change((d) => ({ ...d, images: [image, ...d.images] }));
      filled.add(slot.id);
      updateStatus(item, filled);
    } catch (e) {
      setError(`파일을 올리지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusyFiles((s) => { const next = new Set(s); next.delete(slot.id); return next; });
    }
  };

  const filledSlots = (itemId: string) =>
    new Set((dataRef.current?.images ?? []).filter((i) => i.item_id === itemId && i.file_id).map((i) => i.file_id as string));

  const pickFile = (item: DesignItem, slot: DesignFile, picked: File[]) => {
    if (picked[0]) void uploadOne(item, slot, picked[0], filledSlots(item.id));
  };

  const addFile = (itemId: string, extra: Partial<DesignFile> = {}) => {
    const siblings = (dataRef.current?.files ?? []).filter((f) => f.item_id === itemId);
    return api.insertFile({ item_id: itemId, sort_order: nextOrder(siblings), label: `파일 ${siblings.length + 1}`, ...extra }).then((file) => {
      change((d) => ({ ...d, files: [...d.files, file] }));
      return file;
    });
  };

  const dropOnItem = async (item: DesignItem, picked: File[]) => {
    const filled = filledSlots(item.id);
    for (const one of picked) {
      const slots = [...(dataRef.current?.files ?? [])].filter((f) => f.item_id === item.id).sort(bySortOrder);
      const slot = slotForDrop(slots, filled, one.name) ?? await addFile(item.id, { file_name: one.name });
      await uploadOne(item, slot, one, filled);
    }
  };

  const actions: BoardActions = {
    addGroup: () => {
      const groups = dataRef.current?.groups ?? [];
      const color: DesignColor = api.DESIGN_COLORS[groups.length % api.DESIGN_COLORS.length];
      save(api.insertGroup({ name: '새 묶음', color, sort_order: nextOrder(groups) }).then((g) => {
        change((d) => ({ ...d, groups: [...d.groups, g] }));
        setOpenGroups((cur) => [...(cur ?? []), g.id]);
      }));
    },
    patchGroup: (id, patch) => {
      change((d) => ({ ...d, groups: d.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
      save(api.updateGroup(id, patch));
    },
    recolorGroup: (group) => {
      const at = api.DESIGN_COLORS.indexOf(group.color);
      actions.patchGroup(group.id, { color: api.DESIGN_COLORS[(at + 1) % api.DESIGN_COLORS.length] });
    },
    removeGroup: (group: DesignGroup) => {
      const ids = (dataRef.current?.items ?? []).filter((i) => i.group_id === group.id).map((i) => i.id);
      setPendingDelete({
        title: '묶음 삭제',
        message: `‘${group.name || '이름 없음'}’ 묶음과 안의 항목 ${ids.length}개, 올린 그림까지 모두 지워집니다.`,
        run: async () => {
          await api.deleteGroup(group.id, pathsOf(ids));
          if (openId && ids.includes(openId)) setOpenId(null);
          change((d) => ({
            ...d,
            groups: d.groups.filter((g) => g.id !== group.id),
            items: d.items.filter((i) => i.group_id !== group.id),
            files: d.files.filter((f) => !ids.includes(f.item_id)),
            images: d.images.filter((i) => !ids.includes(i.item_id)),
          }));
        },
      });
    },
    moveGroup: (id, beforeId) => {
      const { next, changed } = reorder(dataRef.current?.groups ?? [], id, beforeId);
      if (changed.length === 0) return;
      change((d) => ({ ...d, groups: next }));
      save(Promise.all(changed.map((g) => api.updateGroup(g.id, { sort_order: g.sort_order }))));
    },
    addItem: (groupId) => {
      const siblings = (dataRef.current?.items ?? []).filter((i) => i.group_id === groupId);
      save(api.insertItem({ group_id: groupId, sort_order: nextOrder(siblings), name: '새 항목' }).then(async (item) => {
        const file = await api.insertFile({ item_id: item.id, sort_order: 0, label: '파일 1' });
        change((d) => ({ ...d, items: [...d.items, item], files: [...d.files, file] }));
        setOpenId(item.id);
      }));
    },
    patchItem,
    moveItem: (id, groupId, beforeId) => {
      const { next, changed } = moveItem(dataRef.current?.items ?? [], id, groupId, beforeId);
      if (changed.length === 0) return;
      change((d) => ({ ...d, items: next }));
      save(Promise.all(changed.map((i) => api.updateItem(i.id, { group_id: i.group_id, sort_order: i.sort_order }))));
    },
    dropOnItem: (item, picked) => { void dropOnItem(item, picked); },
    openItem: setOpenId,
  };

  // ---------- 시안 · 가이드 ----------
  const draftsOf = (itemId: string) =>
    (dataRef.current?.images ?? []).filter((i) => i.item_id === itemId && !i.file_id).sort(bySortOrder);

  const uploadDrafts = async (item: DesignItem, picked: File[]) => {
    const pictures = picked.filter((f) => f.type.startsWith('image/'));
    if (pictures.length < picked.length) setError('시안은 그림 파일만 올릴 수 있습니다.');
    if (pictures.length === 0) return;
    setBusyDraft(true);
    try {
      let order = nextOrder(draftsOf(item.id));
      for (const one of pictures) {
        const image = await api.uploadImage({ itemId: item.id, sortOrder: order }, one, userName);
        order += 1;
        change((d) => ({ ...d, images: [image, ...d.images] }));
      }
      if (item.status === 'todo') patchItem(item.id, { status: 'doing' });
    } catch (e) {
      setError(`그림을 올리지 못했습니다: ${(e as Error).message}`);
    } finally {
      setBusyDraft(false);
    }
  };

  const patchImage = (id: string, patch: Partial<DesignImage>) => {
    change((d) => ({ ...d, images: d.images.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
    save(api.updateImage(id, patch));
  };

  const moveDraft = (item: DesignItem, id: string, beforeId: string | null) => {
    const { changed } = reorder(draftsOf(item.id), id, beforeId);
    if (changed.length === 0) return;
    change((d) => ({ ...d, images: d.images.map((i) => changed.find((c) => c.id === i.id) ?? i) }));
    save(Promise.all(changed.map((i) => api.updateImage(i.id, { sort_order: i.sort_order }))));
  };

  const adoptedOf = (draft: DesignImage) => adoptedRows(draft, dataRef.current?.images ?? []);

  // 채택을 내린다. 최종 파일 칸에 넣었던 버전만 빠지고, 저장소 파일은 시안이 계속 쓴다.
  const dropPick = async (draft: DesignImage) => {
    const rows = adoptedOf(draft);
    await Promise.all(rows.map((row) => api.deleteImage(row.id, [])));
    await api.updateImage(draft.id, { picked: false });
    const ids = rows.map((row) => row.id);
    change((d) => ({
      ...d,
      images: d.images.filter((i) => !ids.includes(i.id)).map((i) => (i.id === draft.id ? { ...i, picked: false } : i)),
      comments: d.comments.filter((c) => !ids.includes(c.image_id)),
    }));
  };

  // 시안을 채택하면 파일 칸의 새 버전이 되고, 이전 버전은 기록에 남는다. 채택은 칸마다 한 장이다.
  const adopt = async (draft: DesignImage, item: DesignItem, chosen: DesignFile | undefined) => {
    const slots = [...(dataRef.current?.files ?? [])].filter((f) => f.item_id === item.id).sort(bySortOrder);
    const busyKey = chosen?.id ?? slots[0]?.id ?? draft.id;
    if (busyFiles.has(busyKey)) return;
    setBusyFiles((s) => new Set(s).add(busyKey));
    try {
      const slot = chosen ?? slots[0] ?? await addFile(item.id, { file_name: draft.file_name });
      for (const other of draftsOf(item.id)) {
        if (!other.picked) continue;
        const rows = adoptedOf(other);
        if (rows.length === 0 || rows.some((r) => r.file_id === slot.id)) await dropPick(other);
      }
      const row = await api.adoptImage(draft, slot.id);
      await api.updateImage(draft.id, { picked: true });
      change((d) => ({ ...d, images: [row, ...d.images.map((i) => (i.id === draft.id ? { ...i, picked: true } : i))] }));
      updateStatus(item, filledSlots(item.id).add(slot.id));
    } catch (e) {
      setError(`시안을 채택하지 못했습니다: ${(e as Error).message}`);
      void reload();
    } finally {
      setBusyFiles((s) => { const next = new Set(s); next.delete(busyKey); return next; });
    }
  };

  const pickImage = (image: DesignImage, slotId?: string) => {
    const item = dataRef.current?.items.find((i) => i.id === image.item_id);
    if (!item) return;
    if (image.picked) {
      const ids = adoptedOf(image).map((row) => row.id);
      const notes = (dataRef.current?.comments ?? []).filter((c) => ids.includes(c.image_id)).length;
      if (notes > 0) {
        setPendingDelete({
          title: '채택 취소',
          message: `최종 파일에 넣은 그림과 거기 달린 피드백 ${notes}개가 지워집니다.`,
          run: () => dropPick(image),
        });
      } else save(dropPick(image));
    } else if (item.split) {
      for (const other of draftsOf(item.id)) if (other.picked) patchImage(other.id, { picked: false });
      patchImage(image.id, { picked: true });
    } else {
      void adopt(image, item, dataRef.current?.files.find((f) => f.id === slotId));
    }
  };

  // 최종 파일에서 채택한 그림이 빠지면 시안의 채택도 풀린다.
  const releaseDrafts = (gone: DesignImage[]) => {
    const images = dataRef.current?.images ?? [];
    for (const draft of images.filter((i) => !i.file_id && i.picked)) {
      const rows = adoptedRows(draft, images);
      if (rows.length > 0 && rows.every((r) => gone.some((g) => g.id === r.id))) patchImage(draft.id, { picked: false });
    }
  };

  const addComment = (imageId: string, body: string, pin: { x: number; y: number } | null) => {
    save(api.insertComment({ image_id: imageId, author_name: userName, body, pin_x: pin?.x ?? null, pin_y: pin?.y ?? null })
      .then((c) => change((d) => ({ ...d, comments: [...d.comments, c] }))));
  };

  const removeComment = (comment: DesignComment) => {
    change((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== comment.id) }));
    save(api.deleteComment(comment.id));
  };

  const removeItem = (item: DesignItem) => setPendingDelete({
    title: '항목 삭제',
    message: `‘${item.name || '이름 없음'}’ 항목과 올린 그림이 모두 지워집니다.`,
    run: async () => {
      await api.deleteItem(item.id, pathsOf([item.id]));
      setOpenId(null);
      change((d) => ({
        ...d,
        items: d.items.filter((i) => i.id !== item.id),
        files: d.files.filter((f) => f.item_id !== item.id),
        images: d.images.filter((i) => i.item_id !== item.id),
      }));
    },
  });

  const removeFile = (file: DesignFile) => setPendingDelete({
    title: '파일 칸 삭제',
    message: `‘${file.label || file.file_name || '파일'}’ 칸과 올린 그림이 지워집니다.`,
    run: async () => {
      const images = dataRef.current?.images ?? [];
      const rows = images.filter((i) => i.file_id === file.id);
      await api.deleteFile(file.id, unusedPaths(rows, images));
      releaseDrafts(rows);
      change((d) => ({ ...d, files: d.files.filter((f) => f.id !== file.id), images: d.images.filter((i) => i.file_id !== file.id) }));
    },
  });

  const removeImage = (image: DesignImage) => setPendingDelete({
    title: '그림 삭제',
    message: `‘${image.file_name}’ 그림이 지워집니다.${!image.file_id && adoptedOf(image).length > 0 ? ' 최종 파일에 넣은 그림은 남습니다.' : ''}`,
    run: async () => {
      await api.deleteImage(image.id, unusedPaths([image], dataRef.current?.images ?? []));
      releaseDrafts([image]);
      change((d) => ({
        ...d,
        images: d.images.filter((i) => i.id !== image.id),
        comments: d.comments.filter((c) => c.image_id !== image.id),
      }));
      setViewing((v) => (v?.id === image.id ? null : v));
    },
  });

  const taskActions = {
    // after 일정 바로 아래에 넣는다. 그 일정의 기간과 종류를 이어받아 막대가 바로 그 자리에 나타난다.
    add: (after?: DesignTask | null) => {
      const tasks = dataRef.current?.tasks ?? [];
      const row = {
        name: '새 일정', owner: '', start_date: after?.start_date ?? today, end_date: after?.end_date ?? today,
        category: after?.category ?? 'base', sort_order: nextOrder(tasks),
      };
      save(api.insertTask(row).then(async (t) => {
        const { next, changed } = reorder([...tasks, t], t.id, insertSlot(tasks, after));
        change((d) => ({ ...d, tasks: next }));
        setNewTaskId(t.id);
        await Promise.all(changed.map((c) => api.updateTask(c.id, { sort_order: c.sort_order })));
      }));
    },
    patch: (id: string, patch: Partial<DesignTask>) => {
      change((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
      save(api.updateTask(id, patch));
    },
    remove: (task: DesignTask) => setPendingDelete({
      title: '일정 삭제',
      message: `‘${task.name || '이름 없음'}’ 일정이 지워집니다.`,
      run: async () => {
        await api.deleteTask(task.id);
        change((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== task.id) }));
      },
    }),
    move: (id: string, beforeId: string | null) => {
      const { next, changed } = reorder(dataRef.current?.tasks ?? [], id, beforeId);
      if (changed.length === 0) return;
      change((d) => ({ ...d, tasks: next }));
      save(Promise.all(changed.map((t) => api.updateTask(t.id, { sort_order: t.sort_order }))));
    },
  };

  // ---------- 보여 줄 내용 ----------
  const filesOf = useMemo(() => {
    const map = new Map<string, DesignFile[]>();
    for (const f of [...(data?.files ?? [])].sort(bySortOrder)) {
      const list = map.get(f.item_id);
      if (list) list.push(f); else map.set(f.item_id, [f]);
    }
    return map;
  }, [data?.files]);

  const { latest, filledOf, draftCount, picked } = useMemo(() => {
    const thumb = new Map<string, DesignImage>();     // 대표 그림: 최신 최종 파일 → 채택 시안 → 첫 시안
    const slots = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    const chosen = new Set<string>();
    const images = data?.images ?? [];
    for (const image of images) {
      if (!image.file_id) continue;
      if (!thumb.has(image.item_id)) thumb.set(image.item_id, image);
      const set = slots.get(image.item_id) ?? new Set<string>();
      set.add(image.file_id);
      slots.set(image.item_id, set);
    }
    for (const image of images.filter((i) => !i.file_id).sort(bySortOrder)) {
      counts.set(image.item_id, (counts.get(image.item_id) ?? 0) + 1);
      if (image.picked) chosen.add(image.item_id);
      if (image.picked || !thumb.has(image.item_id)) thumb.set(image.item_id, image);
    }
    return { latest: thumb, filledOf: new Map([...slots].map(([id, set]) => [id, set.size])), draftCount: counts, picked: chosen };
  }, [data?.images]);

  const commentCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of data?.comments ?? []) map.set(c.image_id, (map.get(c.image_id) ?? 0) + 1);
    return map;
  }, [data?.comments]);

  const tasksById = useMemo(() => new Map((data?.tasks ?? []).map((t) => [t.id, t])), [data?.tasks]);
  const deadlinesOf = (item: DesignItem) => itemDeadlines(item, tasksById, picked.has(item.id), today);

  const filtering = query.trim() !== '' || who !== 'all' || status !== 'all' || priority !== 'all';

  const rows: BoardRows[] = useMemo(() => {
    const matches = (item: DesignItem, groupName: string) => {
      const people = item.split ? [item.guide_assignee, item.assignee] : [item.assignee];
      if (who === 'none' ? people.some(Boolean) : who !== 'all' && !people.includes(who)) return false;
      if (status !== 'all' && item.status !== status) return false;
      if (priority !== 'all' && item.priority !== priority) return false;
      const files = filesOf.get(item.id) ?? [];
      return matchesQuery(query, [
        groupName, item.name, item.category, item.priority, item.assignee, item.description, item.rules, item.ideas,
        ...files.flatMap((f) => [f.file_name, f.label, f.note, f.spec_note]),
      ]);
    };
    return [...(data?.groups ?? [])].sort(bySortOrder).map((group) => {
      const all = (data?.items ?? []).filter((i) => i.group_id === group.id).sort(bySortOrder);
      return {
        group,
        items: all.filter((i) => matches(i, group.name)),
        total: all.length,
        done: all.filter((i) => i.status === 'done').length,
      };
    }).filter((row) => !filtering || row.items.length > 0);
  }, [data?.groups, data?.items, filesOf, query, who, status, priority, filtering]);

  const firstTwo = rows.slice(0, 2).map((r) => r.group.id);
  const isOpen = (id: string) => (openGroups ?? firstTwo).includes(id);
  const writeOpen = (next: string[]) => {
    setOpenGroups(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* 기억하지 못해도 이번 화면은 그대로 쓴다 */ }
  };
  const toggleGroup = (id: string) => {
    const cur = openGroups ?? firstTwo;
    writeOpen(cur.includes(id) ? cur.filter((g) => g !== id) : [...cur, id]);
  };
  const allOpen = rows.length > 0 && rows.every((r) => isOpen(r.group.id));

  const sortedTasks = useMemo(() => [...(data?.tasks ?? [])].sort(bySortOrder), [data?.tasks]);
  const shownTasks = sortedTasks.filter((t) => matchesQuery(query, [t.name, t.owner]));

  const openItem = data?.items.find((i) => i.id === openId) ?? null;
  const items = data?.items ?? [];
  const totalFiles = data?.files.length ?? 0;
  const filledFiles = [...filledOf.values()].reduce((a, b) => a + b, 0);
  const doneItems = items.filter((i) => i.status === 'done').length;
  const percent = totalFiles > 0 ? Math.round((filledFiles / totalFiles) * 100) : 0;
  const busyItems = new Set((data?.files ?? []).filter((f) => busyFiles.has(f.id)).map((f) => f.item_id));

  return (
    <div className="dw">
      <div className="dw-head">
        <div>
          <h1>디자인 작업</h1>
          {data && (
            <div className="dw-summary">
              <span>항목 {items.length}개 · 완료 {doneItems}개 · 올린 파일 {filledFiles} / {totalFiles}</span>
              <span className="dw-bar c-blue"><i style={{ width: `${percent}%` }} /></span>
            </div>
          )}
        </div>
        <div className="dw-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>보드</button>
          <button type="button" role="tab" aria-selected={view === 'timeline'} className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>타임라인</button>
          <button type="button" role="tab" aria-selected={view === 'preview'} className={view === 'preview' ? 'active' : ''} onClick={() => setView('preview')}>게임에서 보기</button>
        </div>
      </div>

      {data && !notInstalled && view !== 'preview' && <DesignNow tasks={sortedTasks} today={today} who={who} />}

      {!notInstalled && view !== 'preview' && (
        <div className="dw-toolbar">
          <input
            type="search"
            className="dw-search"
            placeholder={view === 'board' ? '요소, 파일명, 설명 검색' : '일정, 담당 검색'}
            aria-label="검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {view === 'board' && (
            <>
              <div className="dw-chips" role="group" aria-label="담당자">
                {WHO_FILTERS.map((f) => (
                  <button key={f.value} type="button" aria-pressed={who === f.value} className={who === f.value ? 'active' : ''} onClick={() => setWho(f.value)}>{f.label}</button>
                ))}
              </div>
              <select className="dw-filter" aria-label="우선 순위" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="all">우선 순위 전체</option>
                {api.DESIGN_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.value}</option>)}
              </select>
              <select className="dw-filter" aria-label="상태" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">상태 전체</option>
                {api.DESIGN_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {!filtering && (
                <button type="button" className="btn btn-ghost btn-sm dw-all" onClick={() => writeOpen(allOpen ? [] : rows.map((r) => r.group.id))}>
                  {allOpen ? '모두 접기' : '모두 펼치기'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="dw-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setError(null)}>닫기</button>
        </div>
      )}

      {notInstalled ? (
        <div className="dw-empty">
          <p>디자인 작업 공간의 새 DB 구조가 아직 적용되지 않았습니다.</p>
          <p>Supabase SQL Editor에서 <code>supabase/migrations/2026-11-05_design_v3.sql</code>을 실행해 주세요.</p>
        </div>
      ) : !data ? (
        !error && <div className="dw-empty"><p>불러오는 중…</p></div>
      ) : view === 'preview' ? (
        <DesignPreview files={data.files} images={data.images} />
      ) : view === 'board' ? (
        <DesignBoard
          rows={rows}
          filesOf={filesOf}
          filledOf={filledOf}
          dueOf={(item) => finalDeadline(deadlinesOf(item), item.status)}
          draftsOf={draftCount}
          latest={latest}
          busyItems={busyItems}
          isOpen={isOpen}
          filtering={filtering}
          openId={openId}
          onToggle={toggleGroup}
          actions={actions}
        />
      ) : (
        <DesignTimeline
          tasks={shownTasks}
          allTasks={sortedTasks}
          today={today}
          filtering={query.trim() !== ''}
          newId={newTaskId}
          onAdd={taskActions.add}
          onPatch={taskActions.patch}
          onRemove={taskActions.remove}
          onMove={taskActions.move}
        />
      )}

      {openItem && view === 'board' && (
        <DesignItemPanel
          key={openItem.id}
          item={openItem}
          group={data?.groups.find((g) => g.id === openItem.group_id)}
          files={filesOf.get(openItem.id) ?? []}
          drafts={(data?.images ?? []).filter((i) => i.item_id === openItem.id && !i.file_id).sort(bySortOrder)}
          finals={(data?.images ?? []).filter((i) => i.item_id === openItem.id && i.file_id)}
          comments={commentCount}
          tasks={sortedTasks}
          deadlines={deadlinesOf(openItem)}
          busyFiles={busyFiles}
          busyDraft={busyDraft}
          onPatch={(patch) => patchItem(openItem.id, patch)}
          onUploadDrafts={(picked) => { void uploadDrafts(openItem, picked); }}
          onMoveDraft={(id, beforeId) => moveDraft(openItem, id, beforeId)}
          onRank={(id, rank) => patchImage(id, { rank })}
          slotChoices={pickChoices(openItem, filesOf.get(openItem.id) ?? [], data?.images ?? [])}
          onPickImage={pickImage}
          onOpenImage={setViewing}
          onPickFile={(file, picked) => pickFile(openItem, file, picked)}
          onPatchFile={(id, patch) => {
            change((d) => ({ ...d, files: d.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
            save(api.updateFile(id, patch));
          }}
          onAddFile={() => save(addFile(openItem.id))}
          onRemoveFile={removeFile}
          onRemoveImage={removeImage}
          onRemove={() => removeItem(openItem)}
          onClose={() => setOpenId(null)}
        />
      )}

      {viewing && data && (() => {
        const list = viewing.file_id
          ? data.images.filter((i) => i.file_id === viewing.file_id)
          : data.images.filter((i) => i.item_id === viewing.item_id && !i.file_id).sort(bySortOrder);
        const item = data.items.find((i) => i.id === viewing.item_id);
        const slot = data.files.find((f) => f.id === viewing.file_id);
        return (
          <DesignViewer
            key={`viewer-${viewing.file_id ?? viewing.item_id}`}
            title={`${item?.name ?? ''} · ${slot ? slot.label || '파일' : item?.split ? '가이드' : '시안'}`}
            images={list}
            comments={data.comments}
            startId={viewing.id}
            userId={userId}
            ranked={!viewing.file_id}
            slotChoices={item ? pickChoices(item, filesOf.get(item.id) ?? [], data.images) : []}
            onClose={() => setViewing(null)}
            onRank={(id, rank) => patchImage(id, { rank })}
            onPick={pickImage}
            onAddComment={addComment}
            onRemoveComment={removeComment}
            onRemoveImage={removeImage}
          />
        );
      })()}

      {pendingDelete && (
        <ConfirmModal
          title={pendingDelete.title}
          message={pendingDelete.message}
          confirmLabel="삭제"
          danger
          onConfirm={async () => {
            const job = pendingDelete;
            setPendingDelete(null);
            try { await job.run(); }
            catch (e) { setError(`삭제하지 못했습니다: ${(e as Error).message}`); void reload(); }
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
