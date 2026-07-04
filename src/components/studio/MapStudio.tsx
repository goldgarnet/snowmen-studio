import { useState, useEffect, useCallback, useRef } from 'react';
import type { Level } from '../../types';
import { createLevel } from '../../utils/level';
import { encodeLevelCode, decodeLevelCode } from '../../utils/levelCode';
import { useAuth } from '../../context/AuthContext';
import { useGuard, StudioApi } from '../../context/GuardContext';
import { listMyMaps, insertMap, updateMap, deleteMap, registeredToISO, isoToDateStr } from '../../api/maps';
import type { MapRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import Editor from '../editor/Editor';
import PlayView from '../editor/PlayView';
import UploadForm, { UploadPayload } from '../hub/UploadForm';
import MapThumbnail from '../hub/MapThumbnail';
import ConfirmModal from '../common/ConfirmModal';
import Pagination from '../common/Pagination';
import './MapStudio.css';

type View = 'list' | 'editor' | 'play';
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

  const pageCount = Math.max(1, Math.ceil(maps.length / PAGE_SIZE));
  useEffect(() => { setPage((p) => Math.min(p, pageCount)); }, [pageCount]);
  const pagedMaps = maps.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1800); };

  const refresh = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try { setMaps(await listMyMaps(profile.id)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { refresh(); }, [refresh]);

  const openNew = () => {
    const fresh = createLevel(8, 8);
    setLevel(fresh);
    setSavedCode(encodeLevelCode(fresh));
    setEditId(null); setEditTitle('새 맵'); setPublished(false); setEditRow(null);
    setView('editor');
  };

  const openExisting = (m: MapRow) => {
    const lv = decodeLevelCode(m.code);
    if (!lv) { alert('맵 코드를 해석할 수 없어 열 수 없습니다.'); return; }
    setLevel(lv);
    setSavedCode(encodeLevelCode(lv));
    setEditId(m.id); setEditTitle(m.title ?? '제목 없음'); setPublished(m.published); setEditRow(m);
    setView('editor');
  };

  const save = async () => {
    if (!profile) return;
    const code = encodeLevelCode(level);
    try {
      if (editId) {
        await updateMap(editId, { title: editTitle || null, code });
      } else {
        const row = await insertMap({ owner_id: profile.id, title: editTitle || null, code, published: false });
        setEditId(row.id);
      }
      setSavedCode(code);
      showFlash('저장됨');
      refresh();
    } catch (e) { alert('저장 실패: ' + (e as Error).message); }
  };

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
      const updated = await updateMap(editId, {
        title: p.title, author_name: p.author_name, comment: p.comment,
        author_difficulty: p.difficulty, code: p.code, created_at, published: true, published_at,
      });
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

  const leaveToList = () => guard.attempt(() => { setView('list'); refresh(); });

  // ---------- play submode ----------
  if (view === 'play') {
    return <PlayView code={playCode} title={editTitle} backLabel="에디터로" onClose={() => setView('editor')} />;
  }

  // ---------- editor submode ----------
  if (view === 'editor') {
    return (
      <div className="studio-editor">
        <div className="studio-toolbar">
          <button className="btn btn-ghost" onClick={leaveToList}>← 목록</button>
          <input
            className="field-input studio-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="맵 제목"
          />
          {published && <span className="badge badge-accepted">허브 공개됨</span>}
          {isDirty && <span className="studio-dirty">● 저장 안 됨</span>}
          <div className="studio-toolbar-spacer" />
          {flash && <span className="studio-flash">{flash}</span>}
          <button className="btn" onClick={copyCode}>맵 코드 복사</button>
          <button className="btn" onClick={testPlay}>▶ 시뮬레이터</button>
          <button className="btn btn-primary" onClick={save}>저장</button>
          <button className="btn btn-primary" onClick={() => setShowPublish(true)}>허브에 올리기</button>
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

  // ---------- list submode ----------
  return (
    <div className="studio-list">
      <div className="studio-list-head">
        <div>
          <h2>내 맵</h2>
          <p className="studio-sub">제작 중인 맵을 저장하고, 이어서 만들거나 허브에 올릴 수 있어요.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ 새 맵 만들기</button>
      </div>

      {loading ? (
        <div className="studio-empty">불러오는 중…</div>
      ) : maps.length === 0 ? (
        <div className="studio-empty">
          아직 저장한 맵이 없습니다. <b>새 맵 만들기</b>로 시작하세요.
        </div>
      ) : (
        <>
        <div className="studio-grid">
          {pagedMaps.map((m) => (
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
                  {!m.published && m.published_at && (
                    <button className="btn btn-sm btn-primary" onClick={() => republish(m)} disabled={busyId === m.id}>다시 공개</button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(m)}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
        </>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="맵 삭제"
          message={<>'{deleteTarget.title ?? '제목 없음'}' 맵을 삭제할까요? 되돌릴 수 없습니다.</>}
          confirmLabel="삭제"
          danger
          busy={deleting}
          onConfirm={doDeleteMap}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
