import { useState, useEffect, useCallback, useRef } from 'react';
import type { Level } from '../../types';
import { createLevel } from '../../utils/level';
import { encodeLevelCode, decodeLevelCode } from '../../utils/levelCode';
import { useAuth } from '../../context/AuthContext';
import { useGuard, StudioApi } from '../../context/GuardContext';
import { listMyMaps, insertMap, updateMap, deleteMap, registeredToISO, isoToDateStr } from '../../api/maps';
import {
  listMyFolders, insertFolder, updateFolder, deleteFolder, moveMapToFolder, publishFolder,
} from '../../api/folders';
import type { MapRow, FolderRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import Editor from '../editor/Editor';
import PlayView from '../editor/PlayView';
import UploadForm, { UploadPayload } from '../hub/UploadForm';
import FolderForm, { FolderFormPayload } from '../hub/FolderForm';
import FolderGlyph from '../hub/FolderGlyph';
import MapThumbnail from '../hub/MapThumbnail';
import SolutionRecorder from '../hub/SolutionRecorder';
import { insertSolution, deleteSolutionsForMap } from '../../api/solutions';
import ConfirmModal from '../common/ConfirmModal';
import Pagination from '../common/Pagination';
import './MapStudio.css';

type View = 'list' | 'folder' | 'editor' | 'play' | 'record';
const PAGE_SIZE = 8; // 4 columns × 2 rows

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function MapStudio() {
  const { profile } = useAuth();
  const guard = useGuard();
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');

  // Editing state (the map currently open in the editor).
  const [level, setLevel] = useState<Level>(() => createLevel(8, 8));
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [published, setPublished] = useState(false);
  // The full DB row of the map open in the editor (null for a brand-new map).
  // Carries saved metadata (author/comment/difficulty/dates) so re-publishing a
  // previously-published map preserves everything instead of resetting it.
  const [editRow, setEditRow] = useState<MapRow | null>(null);
  // The map code as of the last save/open — used to detect unsaved changes.
  const [savedCode, setSavedCode] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [playCode, setPlayCode] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MapRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null); // per-card action in flight
  const [page, setPage] = useState(1);

  // ---- folders ----
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // folder being viewed
  const [editFolderId, setEditFolderId] = useState<string | null>(null);        // folder the open map belongs to
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showPublishFolder, setShowPublishFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderRow | null>(null);

  const currentFolder = folders.find((f) => f.id === currentFolderId) ?? null;
  const rootMaps = maps.filter((m) => !m.folder_id);              // maps outside any folder
  const folderMaps = maps.filter((m) => m.folder_id === currentFolderId);

  // The list page mixes folders and root maps (folders first), newest first within each.
  const listEntries: ({ kind: 'folder'; folder: FolderRow } | { kind: 'map'; map: MapRow })[] = [
    ...folders.map((f) => ({ kind: 'folder' as const, folder: f })),
    ...rootMaps.map((m) => ({ kind: 'map' as const, map: m })),
  ];
  const pageCount = Math.max(1, Math.ceil(listEntries.length / PAGE_SIZE));
  useEffect(() => { setPage((p) => Math.min(p, pageCount)); }, [pageCount]);
  const pagedEntries = listEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1800); };

  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try { setMaps(await listMyMaps(profile.id)); }
    catch (e) { console.error(e); }
    // Folder table may not exist yet (pre-migration); degrade gracefully.
    try { setFolders(await listMyFolders(profile.id)); } catch (e) { console.error(e); setFolders([]); }
    setLoading(false);
  }, [profile]);

  useEffect(() => { refresh(); }, [refresh]);

  const openNew = (folderId: string | null = null) => {
    const fresh = createLevel(8, 8);
    setLevel(fresh);
    setSavedCode(encodeLevelCode(fresh));
    setEditId(null); setEditTitle('새 맵'); setPublished(false); setEditRow(null);
    setEditFolderId(folderId);
    setView('editor');
  };

  const openExisting = (m: MapRow) => {
    const lv = decodeLevelCode(m.code);
    if (!lv) { alert('맵 코드를 해석할 수 없어 열 수 없습니다.'); return; }
    setLevel(lv);
    setSavedCode(encodeLevelCode(lv));
    setEditId(m.id); setEditTitle(m.title ?? '제목 없음'); setPublished(m.published); setEditRow(m);
    setEditFolderId(m.folder_id);
    setView('editor');
  };

  const save = async () => {
    if (!profile) return;
    const code = encodeLevelCode(level);
    const codeChanged = !!editId && code !== savedCode;
    try {
      if (editId) {
        await updateMap(editId, { title: editTitle || null, code });
        // Layout changed → every recorded 풀이 no longer solves it. Wipe them.
        if (codeChanged) await deleteSolutionsForMap(editId);
      } else {
        // A new map created inside a folder inherits the folder's published state so it
        // stays visible/hidden together with the folder (keeps the member invariant).
        const folderPub = editFolderId ? (folders.find((f) => f.id === editFolderId)?.published ?? false) : false;
        const row = await insertMap({
          owner_id: profile.id, title: editTitle || null, code,
          published: folderPub,
          published_at: folderPub ? new Date().toISOString() : null,
          // Only reference folder_id when actually filing into a folder — keeps a plain
          // new-map save working even before the folder_id column migration is applied.
          ...(editFolderId ? { folder_id: editFolderId } : {}),
        });
        setEditId(row.id); setPublished(folderPub);
      }
      setSavedCode(code);
      showFlash(codeChanged ? '저장됨 (맵이 바뀌어 기존 풀이는 삭제)' : '저장됨');
      refresh();
    } catch (e) { alert('저장 실패: ' + (e as Error).message); }
  };

  // ---- folder actions ----
  const createFolder = async () => {
    if (!profile || !newFolderName.trim()) return;
    try {
      const f = await insertFolder({ owner_id: profile.id, name: newFolderName.trim() });
      setShowNewFolder(false); setNewFolderName('');
      await refresh();
      setCurrentFolderId(f.id); setView('folder'); // jump into the new folder
    } catch (e) { alert('폴더 생성 실패: ' + (e as Error).message); }
  };

  const doPublishFolder = async (p: FolderFormPayload) => {
    if (!currentFolderId) return;
    await publishFolder(currentFolderId, {
      name: p.name, author_name: p.author_name, comment: p.comment,
      created_at: registeredToISO(p.registered_on),
    });
    setShowPublishFolder(false);
    showFlash('폴더를 허브에 올렸습니다');
    refresh();
  };

  const saveFolderMeta = async (p: FolderFormPayload) => {
    if (!currentFolderId) return;
    await updateFolder(currentFolderId, {
      name: p.name, author_name: p.author_name, comment: p.comment,
      created_at: registeredToISO(p.registered_on),
    });
    setEditingFolder(false);
    showFlash('폴더 정보를 수정했습니다');
    refresh();
  };

  const doDeleteFolder = async () => {
    if (!deleteFolderTarget) return;
    setDeleting(true);
    try {
      await deleteFolder(deleteFolderTarget.id);
      setDeleteFolderTarget(null); setCurrentFolderId(null); setView('list');
      refresh();
    } catch (e) { alert('폴더 삭제 실패: ' + (e as Error).message); }
    finally { setDeleting(false); }
  };

  const addMapToFolder = async (mapId: string) => {
    if (!currentFolderId) return;
    setBusyId(mapId);
    try { await moveMapToFolder(mapId, currentFolderId, currentFolder?.published ?? false); refresh(); }
    catch (e) { alert('맵 이동 실패: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  const removeMapFromFolder = async (mapId: string) => {
    setBusyId(mapId);
    try { await moveMapToFolder(mapId, null, false); refresh(); }
    catch (e) { alert('맵 이동 실패: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  const leaveEditor = () => guard.attempt(() => {
    if (editFolderId) { setCurrentFolderId(editFolderId); setView('folder'); }
    else setView('list');
    refresh();
  });

  const copyCode = () => {
    navigator.clipboard.writeText(encodeLevelCode(level));
    showFlash('맵 코드 복사됨');
  };

  const testPlay = () => { setPlayCode(encodeLevelCode(level)); setView('play'); };

  const doPublish = async (p: UploadPayload) => {
    if (!profile) return;
    const created_at = registeredToISO(p.registered_on);
    // Preserve the original publish time when re-publishing a map that was already
    // published before (e.g. after being taken private); only stamp fresh on the
    // first publish.
    const published_at = editRow?.published_at ?? new Date().toISOString();
    if (editId) {
      const codeChanged = p.code !== savedCode;
      const updated = await updateMap(editId, {
        title: p.title, author_name: p.author_name, comment: p.comment,
        author_difficulty: p.difficulty, code: p.code, created_at, published: true, published_at,
      });
      if (codeChanged) await deleteSolutionsForMap(editId);
      setPublished(true); setEditRow(updated);
    } else {
      const row = await insertMap({
        owner_id: profile.id,
        author_name: p.author_name, code: p.code, title: p.title,
        comment: p.comment, author_difficulty: p.difficulty, created_at, published: true, published_at,
      });
      setEditId(row.id); setPublished(true); setEditRow(row);
    }
    setSavedCode(p.code);
    setShowPublish(false);
    showFlash('허브에 올렸습니다');
    refresh();
  };

  // Re-publish a previously-published (now private) map with a single click.
  // Just flips `published` back on — every other field (comment, 난이도, status,
  // 공개 시각) is left untouched, so nothing is lost.
  const republish = async (m: MapRow) => {
    setBusyId(m.id);
    try { await updateMap(m.id, { published: true }); showFlash('다시 공개했습니다'); refresh(); }
    catch (e) { alert('공개 실패: ' + (e as Error).message); }
    finally { setBusyId(null); }
  };

  // Save a 풀이 recorded in the studio as the owner's solution. The record button is
  // disabled while dirty, so the current level already matches the saved map code.
  const saveStudioSolution = async (moves: string, turnCount: number) => {
    if (!editId || !profile) return;
    await insertSolution({
      map_id: editId,
      author_id: profile.id,
      author_name: editRow?.author_name || profile.name,
      moves,
      turn_count: turnCount,
    });
    setView('editor');
    showFlash('풀이가 등록되었습니다');
  };

  const doDeleteMap = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await deleteMap(deleteTarget.id); setDeleteTarget(null); refresh(); }
    catch (e) { alert('삭제 실패: ' + (e as Error).message); }
    finally { setDeleting(false); }
  };

  // --- unsaved-changes guard: expose isDirty/save to the app via a stable api
  // that delegates to the latest closures. ---
  const isDirty = view === 'editor' && encodeLevelCode(level) !== savedCode;
  const latest = useRef<StudioApi>({ isDirty: () => false, save: async () => {} });
  latest.current = { isDirty: () => isDirty, save };

  useEffect(() => {
    const api: StudioApi = { isDirty: () => latest.current.isDirty(), save: () => latest.current.save() };
    guard.register(api);
    return () => guard.register(null);
  }, [guard]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // A saved-map tile, shared by the flat list and the folder view. In a folder the
  // per-card action is "폴더에서 빼기"; in the root list it's the "다시 공개" shortcut.
  const renderMapTile = (m: MapRow, context: 'list' | 'folder') => (
    <div className="studio-card" key={m.id} onClick={() => openExisting(m)}>
      <div className="studio-card-thumb">
        <MapThumbnail code={m.code} />
        {m.published
          ? <span className={`badge badge-${m.status} studio-card-badge`}>{STATUS_LABEL[m.status]}</span>
          : m.published_at
            ? <span className="badge badge-private studio-card-badge">비공개</span>
            : <span className="badge badge-draft studio-card-badge">제작중</span>}
      </div>
      <div className="studio-card-body">
        <div className="studio-card-title">{m.title || '제목 없음'}</div>
        <div className="studio-card-meta">
          {m.published ? '허브 공개' : m.published_at ? '비공개' : '제작중'} · {formatDate(m.updated_at)}
        </div>
        <div className="studio-card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" onClick={() => openExisting(m)}>이어서 만들기</button>
          {context === 'list' && !m.published && m.published_at && (
            <button className="btn btn-sm btn-primary" onClick={() => republish(m)} disabled={busyId === m.id}>다시 공개</button>
          )}
          {context === 'folder' && (
            <button className="btn btn-sm" onClick={() => removeMapFromFolder(m.id)} disabled={busyId === m.id}>폴더에서 빼기</button>
          )}
          <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(m)}>삭제</button>
        </div>
      </div>
    </div>
  );

  const newFolderModal = showNewFolder && (
    <div className="modal-backdrop" onClick={() => setShowNewFolder(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 className="modal-title">새 맵 폴더 만들기</h3>
        <label className="field-label">폴더 이름</label>
        <input className="field-input" autoFocus value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); }}
          placeholder="예: 튜토리얼 챕터" />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>취소</button>
          <button className="btn btn-primary" onClick={createFolder} disabled={!newFolderName.trim()}>만들기</button>
        </div>
      </div>
    </div>
  );

  const mapDeleteModal = deleteTarget && (
    <ConfirmModal
      title="맵 삭제"
      message={<>'{deleteTarget.title ?? '제목 없음'}' 맵을 삭제할까요? 되돌릴 수 없습니다.</>}
      confirmLabel="삭제"
      danger
      busy={deleting}
      onConfirm={doDeleteMap}
      onCancel={() => setDeleteTarget(null)}
    />
  );

  // ---------- play submode ----------
  if (view === 'play') {
    return <PlayView code={playCode} title={editTitle} backLabel="에디터로" onClose={() => setView('editor')} />;
  }

  // ---------- solution recording submode ----------
  if (view === 'record') {
    return (
      <SolutionRecorder
        code={encodeLevelCode(level)}
        title={`풀이 등록 · ${editTitle || '맵'}`}
        onSave={saveStudioSolution}
        onCancel={() => setView('editor')}
      />
    );
  }

  // ---------- editor submode ----------
  if (view === 'editor') {
    return (
      <div className="studio-editor">
        <div className="studio-toolbar">
          <button className="btn btn-ghost" onClick={leaveEditor}>← {editFolderId ? '폴더' : '목록'}</button>
          <input
            className="field-input studio-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="맵 제목"
          />
          {published && <span className="badge badge-accepted">허브 공개됨</span>}
          {editFolderId && <span className="badge badge-draft">📁 폴더 맵</span>}
          {isDirty && <span className="studio-dirty">● 저장 안 됨</span>}
          <div className="studio-toolbar-spacer" />
          {flash && <span className="studio-flash">{flash}</span>}
          <button className="btn" onClick={copyCode}>맵 코드 복사</button>
          <button className="btn" onClick={testPlay}>▶ 시뮬레이터</button>
          {published && editId && (
            <button
              className="btn"
              onClick={() => setView('record')}
              disabled={isDirty}
              title={isDirty ? '먼저 저장한 뒤 풀이를 녹화할 수 있어요' : '맵을 플레이해 풀이를 등록합니다'}
            >
              ● 풀이 등록
            </button>
          )}
          <button className="btn btn-primary" onClick={save}>저장</button>
          {/* Folder maps are published together with their folder, not individually. */}
          {!editFolderId && (
            <button className="btn btn-primary" onClick={() => setShowPublish(true)}>허브에 올리기</button>
          )}
        </div>

        <div className="studio-editor-body">
          <Editor level={level} setLevel={setLevel} />
        </div>

        {showPublish && (
          <UploadForm
            title="허브에 올리기"
            submitLabel="허브에 올리기"
            lockCode
            initial={{
              // Prefill saved metadata so re-publishing keeps the author, comment,
              // 출제자 난이도 and 등록일 that were set before (empty for a new map).
              author_name: editRow?.author_name ?? profile?.name ?? '',
              code: encodeLevelCode(level),
              title: editTitle,
              comment: editRow?.comment ?? '',
              difficulty: editRow?.author_difficulty ?? null,
              registered_on: editRow ? isoToDateStr(editRow.created_at) : undefined,
            }}
            onSubmit={doPublish}
            onCancel={() => setShowPublish(false)}
          />
        )}
      </div>
    );
  }

  // ---------- folder submode (inside one of my folders) ----------
  if (view === 'folder' && currentFolder) {
    return (
      <div className="studio-list">
        <div className="studio-list-head">
          <div className="studio-folder-head-left">
            <button className="btn btn-ghost" onClick={() => { setCurrentFolderId(null); setView('list'); }}>← 내 맵</button>
            <div>
              <h2>📁 {currentFolder.name || '이름 없는 폴더'}</h2>
              <p className="studio-sub">
                {currentFolder.published ? '허브에 공개된 폴더' : '제작 중인 폴더'} · 맵 {folderMaps.length}개
              </p>
            </div>
          </div>
          <div className="studio-list-head-actions">
            {flash && <span className="studio-flash">{flash}</span>}
            <button className="btn" onClick={() => setShowMovePicker(true)}>맵 옮겨 넣기</button>
            <button className="btn" onClick={() => setEditingFolder(true)}>폴더 정보 수정</button>
            <button className="btn btn-danger" onClick={() => setDeleteFolderTarget(currentFolder)}>폴더 삭제</button>
            <button className="btn btn-primary" onClick={() => openNew(currentFolder.id)}>+ 새 맵</button>
            <button className="btn btn-primary" onClick={() => setShowPublishFolder(true)}>
              {currentFolder.published ? '허브 정보 갱신' : '허브에 올리기'}
            </button>
          </div>
        </div>

        {folderMaps.length === 0 ? (
          <div className="studio-empty">
            이 폴더에는 아직 맵이 없습니다. <b>새 맵</b>을 만들거나 <b>맵 옮겨 넣기</b>로 채워보세요.
          </div>
        ) : (
          <div className="studio-grid">
            {folderMaps.map((m) => renderMapTile(m, 'folder'))}
          </div>
        )}

        {showMovePicker && (
          <div className="modal-backdrop" onClick={() => setShowMovePicker(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
              <h3 className="modal-title">폴더로 옮길 맵 선택</h3>
              {rootMaps.length === 0 ? (
                <p className="studio-sub">폴더 밖에 옮길 수 있는 맵이 없습니다.</p>
              ) : (
                <div className="studio-move-list">
                  {rootMaps.map((m) => (
                    <div className="studio-move-row" key={m.id}>
                      <div className="studio-move-thumb"><MapThumbnail code={m.code} /></div>
                      <span className="studio-move-title">{m.title || '제목 없음'}</span>
                      <button className="btn btn-sm btn-primary" disabled={busyId === m.id} onClick={() => addMapToFolder(m.id)}>넣기</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowMovePicker(false)}>닫기</button>
              </div>
            </div>
          </div>
        )}

        {showPublishFolder && (
          <FolderForm
            title={currentFolder.published ? '허브 정보 갱신' : '폴더를 허브에 올리기'}
            submitLabel={currentFolder.published ? '갱신' : '허브에 올리기'}
            initial={{
              name: currentFolder.name,
              author_name: currentFolder.author_name ?? profile?.name ?? '',
              comment: currentFolder.comment ?? '',
              registered_on: currentFolder.published ? isoToDateStr(currentFolder.created_at) : undefined,
            }}
            onSubmit={doPublishFolder}
            onCancel={() => setShowPublishFolder(false)}
          />
        )}

        {editingFolder && (
          <FolderForm
            title="폴더 정보 수정"
            submitLabel="저장"
            initial={{
              name: currentFolder.name,
              author_name: currentFolder.author_name ?? '',
              comment: currentFolder.comment ?? '',
              registered_on: isoToDateStr(currentFolder.created_at),
            }}
            onSubmit={saveFolderMeta}
            onCancel={() => setEditingFolder(false)}
          />
        )}

        {deleteFolderTarget && (
          <ConfirmModal
            title="폴더 삭제"
            message={<>'{deleteFolderTarget.name || '이름 없는 폴더'}' 폴더를 삭제할까요? 폴더 안의 맵은 삭제되지 않고 <b>단독 맵</b>(비공개)으로 남습니다.</>}
            confirmLabel="삭제"
            danger
            busy={deleting}
            onConfirm={doDeleteFolder}
            onCancel={() => setDeleteFolderTarget(null)}
          />
        )}

        {mapDeleteModal}
      </div>
    );
  }

  // ---------- list submode ----------
  return (
    <div className="studio-list">
      <div className="studio-list-head">
        <div>
          <h2>내 맵</h2>
          <p className="studio-sub">제작 중인 맵과 폴더를 관리하고, 이어서 만들거나 허브에 올릴 수 있어요.</p>
        </div>
        <div className="studio-list-head-actions">
          <button className="btn" onClick={() => setShowNewFolder(true)}>+ 새 맵 폴더 만들기</button>
          <button className="btn btn-primary" onClick={() => openNew(null)}>+ 새 맵 만들기</button>
        </div>
      </div>

      {loading ? (
        <div className="studio-empty">불러오는 중…</div>
      ) : listEntries.length === 0 ? (
        <div className="studio-empty">
          아직 저장한 맵이 없습니다. <b>새 맵 만들기</b>로 시작하세요.
        </div>
      ) : (
        <>
        <div className="studio-grid">
          {pagedEntries.map((e) => e.kind === 'folder' ? (
            <div className="studio-card studio-folder-card" key={`f-${e.folder.id}`} onClick={() => { setCurrentFolderId(e.folder.id); setView('folder'); }}>
              <div className="studio-card-thumb folder-card-thumb">
                <FolderGlyph />
                <span className="badge folder-card-badge">📁 {maps.filter((m) => m.folder_id === e.folder.id).length}</span>
                {e.folder.published && <span className="badge badge-accepted studio-card-badge">허브 공개</span>}
              </div>
              <div className="studio-card-body">
                <div className="studio-card-title">📁 {e.folder.name || '이름 없는 폴더'}</div>
                <div className="studio-card-meta">폴더 · 맵 {maps.filter((m) => m.folder_id === e.folder.id).length}개</div>
              </div>
            </div>
          ) : renderMapTile(e.map, 'list'))}
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}

      {newFolderModal}
      {mapDeleteModal}
    </div>
  );
}
