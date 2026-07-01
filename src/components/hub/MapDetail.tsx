import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { MapRow } from '../../api/types';
import { STATUS_LABEL } from '../../api/types';
import { setReview, updateMap, deleteMap } from '../../api/maps';
import StarRating from './StarRating';
import StatusControl from './StatusControl';
import CommentList from './CommentList';
import UploadForm, { UploadPayload } from './UploadForm';

interface MapDetailProps {
  map: MapRow;
  onBack: () => void;
  onPlay: (map: MapRow) => void;
  onChanged: (updated?: MapRow) => void;
}

export default function MapDetail({ map: initial, onBack, onPlay, onChanged }: MapDetailProps) {
  const { profile } = useAuth();
  const [map, setMap] = useState<MapRow>(initial);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const isOwner = profile?.id === map.owner_id;
  const showFlash = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1500); };

  const changeStatus = async (status: MapRow['status']) => {
    setBusy(true);
    try {
      await setReview(map.id, { status });
      const updated = { ...map, status };
      setMap(updated); onChanged(updated);
    } catch (e) { alert('상태 변경 실패: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  const changeDifficulty = async (difficulty: number) => {
    setBusy(true);
    try {
      await setReview(map.id, { difficulty });
      const updated = { ...map, difficulty };
      setMap(updated); onChanged(updated);
    } catch (e) { alert('난이도 변경 실패: ' + (e as Error).message); }
    finally { setBusy(false); }
  };

  const saveEdit = async (p: UploadPayload) => {
    const updated = await updateMap(map.id, {
      title: p.title, author_name: p.author_name, comment: p.comment, code: p.code,
    });
    setMap(updated); onChanged(updated); setEditing(false);
    showFlash('수정되었습니다');
  };

  const remove = async () => {
    if (!confirm('이 맵을 삭제할까요? 되돌릴 수 없습니다.')) return;
    try { await deleteMap(map.id); onChanged(); onBack(); }
    catch (e) { alert('삭제 실패: ' + (e as Error).message); }
  };

  const copyCode = () => { navigator.clipboard.writeText(map.code); showFlash('맵 코드 복사됨'); };

  return (
    <div className="map-detail">
      <div className="detail-topbar">
        <button className="btn btn-ghost" onClick={onBack}>← 허브</button>
        {flash && <span className="studio-flash">{flash}</span>}
        {isOwner && (
          <div className="detail-owner-actions">
            <button className="btn btn-sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn btn-sm btn-danger" onClick={remove}>삭제</button>
          </div>
        )}
      </div>

      <div className="detail-body">
        <div className="detail-header">
          <div>
            <h2 className="detail-title">{map.title || '제목 없음'}</h2>
            <div className="detail-author">🎨 {map.author_name || '익명'}</div>
          </div>
          <span className={`badge badge-${map.status}`}>{STATUS_LABEL[map.status]}</span>
        </div>

        <button className="btn btn-primary detail-play" onClick={() => onPlay(map)}>▶ 플레이하기</button>

        {map.comment && (
          <div className="detail-section">
            <div className="detail-label">코멘트</div>
            <p className="detail-comment">{map.comment}</p>
          </div>
        )}

        <div className="detail-review">
          <div className="detail-review-col">
            <div className="detail-label">난이도 <span className="detail-hint">(누구나 조정 가능)</span></div>
            <div className="detail-diff-row">
              <StarRating value={map.difficulty} onChange={changeDifficulty} size={26} />
              <span className="difficulty-num">
                {map.difficulty != null ? map.difficulty.toFixed(1) : '미지정'}
              </span>
            </div>
          </div>
          <div className="detail-review-col">
            <div className="detail-label">회의 결정 <span className="detail-hint">(누구나 변경 가능)</span></div>
            <StatusControl value={map.status} disabled={busy} onChange={changeStatus} />
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-label">맵 코드</div>
          <div className="detail-code-row">
            <code className="detail-code">{map.code}</code>
            <button className="btn btn-sm" onClick={copyCode}>복사</button>
          </div>
        </div>

        <CommentList mapId={map.id} />
      </div>

      {editing && (
        <UploadForm
          title="맵 수정"
          submitLabel="저장"
          initial={{
            author_name: map.author_name ?? '',
            code: map.code,
            title: map.title ?? '',
            comment: map.comment ?? '',
            difficulty: map.difficulty,
          }}
          onSubmit={saveEdit}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
