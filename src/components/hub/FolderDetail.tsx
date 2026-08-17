import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { FolderRow, MapRow } from '../../api/types';
import { listMapsInFolder, registeredToISO, isoToDateStr } from '../../api/maps';
import { updateFolder, deleteFolder, unpublishFolder } from '../../api/folders';
import MapCard from './MapCard';
import FolderForm, { FolderFormPayload } from './FolderForm';
import SpoilerText from './SpoilerText';
import ConfirmModal from '../common/ConfirmModal';

interface FolderDetailProps {
  folder: FolderRow;
  onBack: () => void;
  onOpenMap: (map: MapRow) => void;
  onChanged: () => void;   // folder meta/publish/delete changed → refresh hub list
}

function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FolderDetail({ folder: initial, onBack, onOpenMap, onChanged }: FolderDetailProps) {
  const { profile } = useAuth();
  const [folder, setFolder] = useState<FolderRow>(initial);
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const isOwner = profile?.id === folder.owner_id;
  const showFlash = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1500); };

  const load = useCallback(async () => {
    setLoading(true);
    try { setMaps(await listMapsInFolder(folder.id)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [folder.id]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const saveEdit = async (p: FolderFormPayload) => {
    const updated = await updateFolder(folder.id, {
      name: p.name, author_name: p.author_name, comment: p.comment,
      created_at: registeredToISO(p.registered_on),
    });
    setFolder(updated); onChanged(); setEditing(false);
    showFlash('수정되었습니다');
  };

  const doUnpublish = async () => {
    setBusy(true);
    try { await unpublishFolder(folder.id); onChanged(); onBack(); }
    catch (e) { alert('비공개 전환 실패: ' + (e as Error).message); setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try { await deleteFolder(folder.id); onChanged(); onBack(); }
    catch (e) { alert('삭제 실패: ' + (e as Error).message); setBusy(false); }
  };

  return (
    <div className="folder-detail">
      <div className="detail-topbar">
        <button className="btn" onClick={onBack}>← 허브로</button>
        {flash && <span className="detail-flash">{flash}</span>}
        {isOwner && (
          <div className="detail-owner-actions">
            <button className="btn" onClick={() => setEditing(true)}>수정</button>
            <button className="btn" onClick={() => setConfirmUnpublish(true)}>비공개로 전환</button>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>삭제</button>
          </div>
        )}
      </div>

      <div className="folder-detail-head">
        <h1 className="detail-title">📁 {folder.name || '이름 없는 폴더'}</h1>
        <div className="folder-detail-meta">
          <span>제작자 <b>{folder.author_name || '익명'}</b></span>
          <span>등록일 {fullDate(folder.created_at)}</span>
          <span>맵 {maps.length}개</span>
        </div>
        {folder.comment && (
          <div className="detail-comment-card">
            <div className="detail-mini-label">코멘트</div>
            <p><SpoilerText text={folder.comment} /></p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="hub-empty">불러오는 중…</div>
      ) : maps.length === 0 ? (
        <div className="hub-empty">이 폴더에는 아직 맵이 없습니다.</div>
      ) : (
        <div className="hub-grid">
          {maps.map((m) => <MapCard key={m.id} map={m} onOpen={onOpenMap} />)}
        </div>
      )}

      {editing && (
        <FolderForm
          title="폴더 수정"
          submitLabel="저장"
          initial={{
            name: folder.name,
            author_name: folder.author_name ?? '',
            comment: folder.comment ?? '',
            registered_on: isoToDateStr(folder.created_at),
          }}
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      )}

      {confirmUnpublish && (
        <ConfirmModal
          title="폴더 비공개로 전환"
          message={<>이 폴더와 폴더 안 모든 맵을 허브에서 내리고 <b>비공개</b>로 전환할까요? 내 <b>맵 제작</b>에는 그대로 남습니다.</>}
          confirmLabel="비공개로 전환"
          busy={busy}
          onConfirm={doUnpublish}
          onCancel={() => setConfirmUnpublish(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="폴더 삭제"
          message={<>이 폴더를 삭제할까요? 폴더 안의 맵은 삭제되지 않고 <b>단독 맵</b>(비공개)으로 남습니다. 되돌릴 수 없습니다.</>}
          confirmLabel="삭제"
          danger
          busy={busy}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
