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

function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
        <button className="btn" onClick={onBack}>← 허브로</button>
        {flash && <span className="detail-flash">{flash}</span>}
        {isOwner && (
          <div className="detail-owner-actions">
            <button className="btn" onClick={() => setEditing(true)}>수정</button>
            <button className="btn btn-danger" onClick={remove}>삭제</button>
          </div>
        )}
      </div>

      <div className="detail-scroll">
        <div className="detail-columns">
          {/* ---- left ---- */}
          <div className="detail-main">
            <div className="detail-header">
              <h1 className="detail-title">{map.title || '제목 없음'}</h1>
              <span className={`badge badge-${map.status}`}>{STATUS_LABEL[map.status]}</span>
            </div>

            <button className="btn btn-primary detail-play" onClick={() => onPlay(map)}>▶ 바로 플레이</button>

            {map.comment && (
              <div className="detail-comment-card">
                <div className="detail-mini-label">코멘트</div>
                <p>{map.comment}</p>
              </div>
            )}

            <div className="detail-info-grid">
              <div className="detail-info">
                <div className="detail-mini-label">제작자</div>
                <div className="detail-info-val">{map.author_name || '익명'}</div>
              </div>
              <div className="detail-info">
                <div className="detail-mini-label">등록일</div>
                <div className="detail-info-val">{fullDate(map.created_at)}</div>
              </div>
              <div className="detail-info">
                <div className="detail-mini-label">난이도</div>
                <div className="detail-info-val">
                  {map.difficulty != null ? <StarRating value={map.difficulty} size={16} /> : <span className="detail-muted">미지정</span>}
                </div>
              </div>
              <div className="detail-info detail-info-clickable" onClick={copyCode}>
                <div className="detail-mini-label">맵 코드 (복사)</div>
                <div className="detail-info-code">{map.code.slice(0, 18)}{map.code.length > 18 ? '…' : ''}</div>
              </div>
            </div>
          </div>

          {/* ---- right: review ---- */}
          <div className="detail-review">
            <div className="review-title">회의 검토</div>
            <div className="review-sub">결정 사항과 피드백을 기록해요.</div>

            <div className="review-block">
              <div className="review-label">난이도 <span className="review-hint">누구나 조정</span></div>
              <div className="review-diff-row">
                <StarRating value={map.difficulty} onChange={changeDifficulty} size={26} />
                <span className="difficulty-num">{map.difficulty != null ? map.difficulty.toFixed(1) : '—'}</span>
              </div>
            </div>

            <div className="review-block">
              <div className="review-label">회의 결정 <span className="review-hint">누구나 변경</span></div>
              <StatusControl value={map.status} disabled={busy} onChange={changeStatus} />
            </div>

            <div className="review-block">
              <CommentList mapId={map.id} />
            </div>
          </div>
        </div>
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
