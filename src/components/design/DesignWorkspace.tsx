import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api/design';
import type { DesignData, DesignGroup, DesignImage, DesignItem, DesignTask } from '../../api/design';
import { bySortOrder, moveItem, reorder } from '../../lib/designBoard';
import ConfirmModal from '../common/ConfirmModal';
import DesignBoard, { type BoardActions } from './DesignBoard';
import DesignItemPanel from './DesignItemPanel';
import DesignTimeline from './DesignTimeline';
import './design.css';

// 디자인 작업 공간 — 항목 보드와 타임라인. 로그인한 팀원 전원이 함께 고친다.
//   · 바꾼 내용은 화면에 먼저 반영하고 저장한다. 저장에 실패하면 오류를 띄우고 서버 값으로 되돌린다.
//   · 다른 사람이 고친 내용은 이 창으로 돌아올 때 다시 읽어 온다.

type View = 'board' | 'timeline';
let lastView: View = 'board';   // 다른 탭에 다녀와도 보던 화면으로

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const nextOrder = (rows: { sort_order: number }[]) => rows.reduce((m, r) => Math.max(m, r.sort_order + 1), 0);
const imageFiles = (files: File[]) => files.filter((f) => f.type.startsWith('image/'));

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
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
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
  const imagesOf = (itemIds: string[]) =>
    (dataRef.current?.images ?? []).filter((i) => itemIds.includes(i.item_id)).map((i) => i.path);

  const uploadTo = async (itemId: string, files: File[]) => {
    const pictures = imageFiles(files);
    if (pictures.length < files.length) setError('그림 파일만 올릴 수 있습니다.');
    if (pictures.length === 0) return;
    setUploading((s) => new Set(s).add(itemId));
    try {
      for (const file of pictures) {
        const image = await api.uploadImage(itemId, file, userName);
        change((d) => ({ ...d, images: [image, ...d.images] }));
      }
    } catch (e) {
      setError(`그림을 올리지 못했습니다: ${(e as Error).message}`);
    } finally {
      setUploading((s) => { const next = new Set(s); next.delete(itemId); return next; });
    }
  };

  const actions: BoardActions = {
    addGroup: () => {
      const groups = dataRef.current?.groups ?? [];
      save(api.insertGroup('새 묶음', nextOrder(groups)).then((g) => change((d) => ({ ...d, groups: [...d.groups, g] }))));
    },
    renameGroup: (id, name) => {
      change((d) => ({ ...d, groups: d.groups.map((g) => (g.id === id ? { ...g, name } : g)) }));
      save(api.updateGroup(id, { name }));
    },
    removeGroup: (group: DesignGroup) => {
      const ids = (dataRef.current?.items ?? []).filter((i) => i.group_id === group.id).map((i) => i.id);
      setPendingDelete({
        title: '묶음 삭제',
        message: `‘${group.name || '이름 없음'}’ 묶음과 안의 항목 ${ids.length}개, 올린 그림까지 모두 지워집니다.`,
        run: async () => {
          await api.deleteGroup(group.id, imagesOf(ids));
          if (openId && ids.includes(openId)) setOpenId(null);
          change((d) => ({
            ...d,
            groups: d.groups.filter((g) => g.id !== group.id),
            items: d.items.filter((i) => i.group_id !== group.id),
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
      save(api.insertItem({ group_id: groupId, sort_order: nextOrder(siblings) }).then((item) => {
        change((d) => ({ ...d, items: [...d.items, item] }));
        // 새 줄의 요소명 칸에서 바로 입력을 시작한다.
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>(`[data-item-id="${item.id}"] .dw-cell-name`)?.focus();
        });
      }));
    },
    patchItem: (id, patch) => {
      change((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
      save(api.updateItem(id, patch));
    },
    moveItem: (id, groupId, beforeId) => {
      const { next, changed } = moveItem(dataRef.current?.items ?? [], id, groupId, beforeId);
      if (changed.length === 0) return;
      change((d) => ({ ...d, items: next }));
      save(Promise.all(changed.map((i) => api.updateItem(i.id, { group_id: i.group_id, sort_order: i.sort_order }))));
    },
    uploadTo: (itemId, files) => { void uploadTo(itemId, files); },
    addItemsFromFiles: (groupId, files) => {
      const pictures = imageFiles(files);
      if (pictures.length < files.length) setError('그림 파일만 올릴 수 있습니다.');
      const start = nextOrder((dataRef.current?.items ?? []).filter((i) => i.group_id === groupId));
      pictures.forEach((file, i) => {
        const name = file.name.replace(/\.[^.]+$/, '');
        save(api.insertItem({ group_id: groupId, sort_order: start + i, name, file_name: file.name }).then(async (item) => {
          change((d) => ({ ...d, items: [...d.items, item] }));
          await uploadTo(item.id, [file]);
        }));
      });
    },
    openItem: setOpenId,
  };

  const removeItem = (item: DesignItem) => setPendingDelete({
    title: '항목 삭제',
    message: `‘${item.name || '이름 없음'}’ 항목과 올린 그림이 모두 지워집니다.`,
    run: async () => {
      await api.deleteItem(item.id, imagesOf([item.id]));
      setOpenId(null);
      change((d) => ({ ...d, items: d.items.filter((i) => i.id !== item.id), images: d.images.filter((i) => i.item_id !== item.id) }));
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
      const row = { name: '새 일정', owner: '', start_date: today, end_date: today, sort_order: nextOrder(tasks) };
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

  const openItem = data?.items.find((i) => i.id === openId) ?? null;
  const items = data?.items ?? [];
  const done = items.filter((i) => i.status === 'done').length;

  return (
    <div className="dw">
      <div className="dw-head">
        <div>
          <h1>디자인 작업</h1>
          {data && <p>{data.groups.length}개 묶음 · 항목 {items.length}개 · 완료 {done}개</p>}
        </div>
        <div className="dw-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>보드</button>
          <button type="button" role="tab" aria-selected={view === 'timeline'} className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>타임라인</button>
        </div>
      </div>

      {error && (
        <div className="dw-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setError(null)}>닫기</button>
        </div>
      )}

      {notInstalled ? (
        <div className="dw-empty">
          <p>디자인 작업 공간의 DB가 아직 준비되지 않았습니다.</p>
          <p>Supabase SQL Editor에서 <code>supabase/migrations/2026-11-05_design_workspace.sql</code>을 실행해 주세요.</p>
        </div>
      ) : !data ? (
        !error && <div className="dw-empty"><p>불러오는 중…</p></div>
      ) : view === 'board' ? (
        <DesignBoard data={data} uploading={uploading} actions={actions} />
      ) : (
        <DesignTimeline
          tasks={[...data.tasks].sort(bySortOrder)}
          today={today}
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
          images={(data?.images ?? []).filter((i) => i.item_id === openItem.id)}
          uploading={uploading.has(openItem.id)}
          onPatch={(patch) => actions.patchItem(openItem.id, patch)}
          onUpload={(files) => actions.uploadTo(openItem.id, files)}
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
