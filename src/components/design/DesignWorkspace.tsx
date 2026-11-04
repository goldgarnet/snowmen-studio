import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../../api/design';
import type { DesignColor, DesignData, DesignFile, DesignGroup, DesignImage, DesignItem, DesignTask } from '../../api/design';
import { bySortOrder, matchesQuery, moveItem, reorder, slotForDrop, statusAfterUpload } from '../../lib/designBoard';
import ConfirmModal from '../common/ConfirmModal';
import DesignBoard, { type BoardActions, type BoardRows } from './DesignBoard';
import DesignItemPanel from './DesignItemPanel';
import DesignTimeline from './DesignTimeline';
import './design.css';

// 디자인 작업 공간 — 항목 보드와 타임라인. 로그인한 팀원 전원이 함께 고친다.
//   · 바꾼 내용은 화면에 먼저 반영하고 저장한다. 저장에 실패하면 오류를 띄우고 서버 값으로 되돌린다.
//   · 다른 사람이 고친 내용은 이 창으로 돌아올 때 다시 읽어 온다.

type View = 'board' | 'timeline';
let lastView: View = 'board';   // 다른 탭에 다녀와도 보던 화면으로

const OPEN_KEY = 'snowmen-design-open-groups';
const WHO_FILTERS = [
  { value: 'all', label: '전체' },
  { value: '시연', label: '시연' },
  { value: '민준·소민', label: '민준·소민' },
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

export default function DesignWorkspace({ userName }: { userName: string }) {
  const [data, setData] = useState<DesignData | null>(null);
  const [notInstalled, setNotInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(lastView);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyFiles, setBusyFiles] = useState<Set<string>>(new Set());
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

  // 칸 하나에 파일 하나를 올린다. filled 는 이 항목에서 그림이 있는 칸들로, 연달아 올릴 때 이어서 쓴다.
  const uploadOne = async (item: DesignItem, slot: DesignFile, picked: File, filled: Set<string>) => {
    setBusyFiles((s) => new Set(s).add(slot.id));
    try {
      const image = await api.uploadImage(slot, picked, userName);
      change((d) => ({ ...d, images: [image, ...d.images] }));
      filled.add(slot.id);
      const total = (dataRef.current?.files ?? []).filter((f) => f.item_id === item.id).length;
      const current = dataRef.current?.items.find((i) => i.id === item.id)?.status ?? item.status;
      const next = statusAfterUpload(current, filled.size, Math.max(total, filled.size));
      if (next !== current) patchItem(item.id, { status: next });
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
      await api.deleteFile(file.id, (dataRef.current?.images ?? []).filter((i) => i.file_id === file.id).map((i) => i.path));
      change((d) => ({ ...d, files: d.files.filter((f) => f.id !== file.id), images: d.images.filter((i) => i.file_id !== file.id) }));
    },
  });

  const removeImage = (image: DesignImage) => setPendingDelete({
    title: '그림 삭제',
    message: `‘${image.file_name}’ 그림이 지워집니다.`,
    run: async () => {
      await api.deleteImage(image);
      change((d) => ({ ...d, images: d.images.filter((i) => i.id !== image.id) }));
    },
  });

  const taskActions = {
    add: () => {
      const tasks = dataRef.current?.tasks ?? [];
      const row = { name: '새 일정', owner: '', start_date: today, end_date: today, category: 'base', sort_order: nextOrder(tasks) };
      save(api.insertTask(row).then((t) => change((d) => ({ ...d, tasks: [...d.tasks, t] }))));
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

  const { latest, filledOf } = useMemo(() => {
    const firstImage = new Map<string, DesignImage>();
    const slots = new Map<string, Set<string>>();
    for (const image of data?.images ?? []) {
      if (!firstImage.has(image.item_id)) firstImage.set(image.item_id, image);
      if (image.file_id) {
        const set = slots.get(image.item_id) ?? new Set<string>();
        set.add(image.file_id);
        slots.set(image.item_id, set);
      }
    }
    return { latest: firstImage, filledOf: new Map([...slots].map(([id, set]) => [id, set.size])) };
  }, [data?.images]);

  const filtering = query.trim() !== '' || who !== 'all' || status !== 'all' || priority !== 'all';

  const rows: BoardRows[] = useMemo(() => {
    const matches = (item: DesignItem, groupName: string) => {
      if (who === 'none' ? item.assignee !== '' : who !== 'all' && item.assignee !== who) return false;
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
        </div>
      </div>

      {!notInstalled && (
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
          <p>Supabase SQL Editor에서 <code>supabase/migrations/2026-11-05_design_v2.sql</code>을 실행해 주세요.</p>
        </div>
      ) : !data ? (
        !error && <div className="dw-empty"><p>불러오는 중…</p></div>
      ) : view === 'board' ? (
        <DesignBoard
          rows={rows}
          filesOf={filesOf}
          filledOf={filledOf}
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
          images={(data?.images ?? []).filter((i) => i.item_id === openItem.id)}
          busyFiles={busyFiles}
          onPatch={(patch) => patchItem(openItem.id, patch)}
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
